import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { getLatestReport, listSessionReports } from "../lib/usage.mjs";

async function fixtureHome() {
  const home = await mkdtemp(join(tmpdir(), "agy-capsule-"));
  const dir = join(home, "sessions", "2026", "11", "18");
  await mkdir(dir, { recursive: true });
  const file = join(dir, "rollout-fixture.jsonl");
  const lines = [
    { timestamp: "2026-11-18T00:00:00.000Z", type: "session_meta", payload: { session_id: "fixture-session", cwd: "D:\\Codex", cli_version: "0.167.1" } },
    { timestamp: "2026-11-18T00:00:01.000Z", type: "turn_context", payload: { turn_id: "turn-1" } },
    { timestamp: "2026-11-18T00:00:02.000Z", type: "event_msg", payload: { type: "task_started", turn_id: "turn-1", started_at: 1763424002 } },
    { timestamp: "2026-11-18T00:00:03.000Z", type: "token_usage_record", payload: { session_id: "fixture-session", turn_id: "turn-1", usage: { input_tokens: 1000, cached_input_tokens: 700, output_tokens: 200, reasoning_output_tokens: 50, total_tokens: 1200 }, thread_token_usage: { input_tokens: 1000, cached_input_tokens: 700, output_tokens: 200, reasoning_output_tokens: 50, total_tokens: 1200 } } },
    { timestamp: "2026-11-18T00:00:04.000Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 1000, cached_input_tokens: 700, output_tokens: 200, reasoning_output_tokens: 50, total_tokens: 1200 }, last_token_usage: { input_tokens: 1000, cached_input_tokens: 700, output_tokens: 200, reasoning_output_tokens: 50, total_tokens: 1200 }, model_context_window: 4000 } } },
    { timestamp: "2026-11-18T00:00:05.000Z", type: "event_msg", payload: { type: "task_complete", turn_id: "turn-1", duration_ms: 10000, time_to_first_token_ms: 2000, completed_at: 1763424012 } }
  ];
  await writeFile(file, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
  return { home, file };
}

test("parses context, cache, totals, and request speed", async () => {
  const { home } = await fixtureHome();
  const report = await getLatestReport({ codexHome: home });
  assert.equal(report.sessionId, "fixture-session");
  assert.equal(report.modelContextWindow, 4000);
  assert.equal(report.requestCount, 1);
  assert.equal(report.latestTurn.usage.inputTokens, 1000);
  assert.equal(report.latestTurn.usage.cachedInputTokens, 700);
  assert.equal(report.latestTurn.contextPercent, 25);
  assert.equal(report.latestTurn.cacheHitPercent, 70);
  assert.equal(report.latestTurn.outputTokensPerSecond, 20);
});

test("lists recent sessions without escaping the telemetry root", async () => {
  const { home, file } = await fixtureHome();
  const reports = await listSessionReports({ codexHome: home, limit: 5 });
  assert.equal(reports.length, 1);
  assert.equal(reports[0].file, file);
});
