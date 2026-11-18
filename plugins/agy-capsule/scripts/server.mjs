import { getLatestReport, listSessionReports, parseRolloutFile, findRolloutFile, toMarkdown } from "../lib/usage.mjs";

const tools = [
  {
    name: "agy_capsule_get_usage",
    description: "Read the latest Codex rollout telemetry and return context, cache, token, request, and generation metrics. Local read-only operation.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Optional session id or rollout file selector. Defaults to the latest session." },
        format: { type: "string", enum: ["json", "markdown"], description: "Output format. Defaults to markdown." },
        max_turns: { type: "number", description: "Maximum number of recent turns to include in JSON output." }
      }
    }
  },
  {
    name: "agy_capsule_list_sessions",
    description: "List recent Codex rollout sessions with compact context and token summaries. Local read-only operation.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Only include files modified within this many days." },
        limit: { type: "number", description: "Maximum number of sessions to return, capped at 100." },
        format: { type: "string", enum: ["json", "markdown"], description: "Output format. Defaults to markdown." }
      }
    }
  },
  {
    name: "agy_capsule_inspect_session",
    description: "Inspect one Codex rollout session by session id or an absolute file path inside CODEX_HOME. Local read-only operation.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session id or filename selector." },
        file: { type: "string", description: "Absolute rollout JSONL path inside CODEX_HOME." },
        max_turns: { type: "number", description: "Maximum number of recent turns to include." },
        format: { type: "string", enum: ["json", "markdown"], description: "Output format. Defaults to markdown." }
      }
    }
  }
];

function resultText(value, format = "markdown") {
  if (format === "json") return JSON.stringify(value, null, 2);
  if (Array.isArray(value)) {
    return value.map((report) => toMarkdown(report)).join("\n\n---\n\n");
  }
  return toMarkdown(value);
}

async function callTool(name, args = {}) {
  if (name === "agy_capsule_get_usage") {
    const report = await getLatestReport(args);
    if (!report) throw new Error("No Codex rollout telemetry was found under CODEX_HOME.");
    return resultText(report, args.format);
  }
  if (name === "agy_capsule_list_sessions") {
    const reports = await listSessionReports(args);
    return resultText(reports, args.format);
  }
  if (name === "agy_capsule_inspect_session") {
    const file = await findRolloutFile(args.file || args.session_id, args);
    if (!file) throw new Error("The requested Codex session was not found under CODEX_HOME.");
    const report = await parseRolloutFile(file, args);
    return resultText(report, args.format);
  }
  throw new Error(`Unknown tool: ${name}`);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(message) {
  if (!message || message.jsonrpc !== "2.0") return;
  if (message.method === "notifications/initialized") return;
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "agy-capsule", version: "0.1.0" }
      }
    });
    return;
  }
  if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { tools } });
    return;
  }
  if (message.method === "tools/call") {
    try {
      const text = await callTool(message.params?.name, message.params?.arguments || {});
      send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text }] } });
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }]
        }
      });
    }
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    try {
      const message = JSON.parse(line);
      void handle(message);
    } catch {
      // Ignore malformed input so one bad notification cannot kill the server.
    }
  }
});
