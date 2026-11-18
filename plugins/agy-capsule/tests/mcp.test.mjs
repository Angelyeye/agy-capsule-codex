import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function request(server, message) {
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      for (const line of String(chunk).split("\n")) {
        if (!line.trim()) continue;
        try {
          const response = JSON.parse(line);
          if (response.id === message.id) {
            server.stdout.off("data", onData);
            resolve(response);
            return;
          }
        } catch {
          // Wait for the next complete line.
        }
      }
    };
    server.stdout.on("data", onData);
    server.once("error", reject);
    server.stdin.write(`${JSON.stringify(message)}\n`);
  });
}

test("MCP server exposes the three read-only tools", async () => {
  const server = spawn(process.execPath, ["scripts/server.mjs"], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, CODEX_HOME: join(root, "tests", "fixtures", "missing") },
  });
  const initialized = await request(server, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } },
  });
  assert.equal(initialized.result.serverInfo.name, "agy-capsule");
  const listed = await request(server, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
    "agy_capsule_get_usage",
    "agy_capsule_list_sessions",
    "agy_capsule_inspect_session",
  ]);
  server.kill();
  await once(server, "close");
});
