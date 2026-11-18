import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegative(value) {
  const n = asNumber(value);
  return n !== null && n >= 0 ? n : null;
}

function msFromSeconds(value) {
  const n = nonNegative(value);
  return n === null ? null : n * 1000;
}

function latestOf(...values) {
  return values.filter((value) => value !== null && value !== undefined && !(typeof value === "number" && !Number.isFinite(value))).at(-1) ?? null;
}

function usageShape(raw = {}) {
  const input = nonNegative(raw.input_tokens);
  const cachedInput = nonNegative(raw.cached_input_tokens);
  const cacheWriteInput = nonNegative(raw.cache_write_input_tokens);
  const output = nonNegative(raw.output_tokens);
  const reasoningOutput = nonNegative(raw.reasoning_output_tokens);
  const total = nonNegative(raw.total_tokens);
  return {
    inputTokens: input,
    cachedInputTokens: cachedInput,
    cacheWriteInputTokens: cacheWriteInput,
    uncachedInputTokens: input === null || cachedInput === null ? null : Math.max(0, input - cachedInput),
    outputTokens: output,
    reasoningOutputTokens: reasoningOutput,
    replyOutputTokens: output === null || reasoningOutput === null ? null : Math.max(0, output - reasoningOutput),
    totalTokens: total ?? ([input, output].every((value) => value !== null) ? input + output : null),
  };
}

function emptyTotals() {
  return usageShape({});
}

function addUsage(left, right) {
  const result = {};
  for (const [key, value] of Object.entries(left)) {
    const other = right[key];
    result[key] = value === null ? other : other === null ? value : value + other;
  }
  return result;
}

function parseLine(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function getTurnId(payload, currentTurnId) {
  return payload?.turn_id || payload?.turnId || payload?.internal_chat_message_metadata_passthrough?.turn_id || currentTurnId || null;
}

function ensureTurn(turns, order, turnId) {
  if (!turnId) return null;
  if (!turns.has(turnId)) {
    turns.set(turnId, {
      turnId,
      startedAtMs: null,
      completedAtMs: null,
      durationMs: null,
      timeToFirstTokenMs: null,
      status: "unknown",
      userMessage: false,
      usageRecords: [],
      usage: null,
      threadUsage: null,
      tokenCount: null,
      modelContextWindow: null,
    });
    order.push(turnId);
  }
  return turns.get(turnId);
}

function isRolloutName(name) {
  return /^rollout-.*\.jsonl$/i.test(name);
}

async function collectRollouts(root, output) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      await collectRollouts(path, output);
    } else if (entry.isFile() && isRolloutName(entry.name)) {
      output.push(path);
    }
  }
}

export function resolveCodexHome(value = process.env.CODEX_HOME || process.env.CODEX_HOME_DIR) {
  return resolve(value || join(homedir(), ".codex"));
}

export function resolveTelemetryRoots(codexHome = resolveCodexHome()) {
  return [
    join(codexHome, "sessions"),
    join(codexHome, "archived_sessions"),
  ];
}

export async function listRolloutFiles(options = {}) {
  const codexHome = resolveCodexHome(options.codexHome);
  const paths = [];
  for (const root of resolveTelemetryRoots(codexHome)) await collectRollouts(root, paths);
  const cutoff = options.days
    ? Date.now() - Math.max(0, Number(options.days)) * 24 * 60 * 60 * 1000
    : 0;
  const rows = [];
  for (const path of paths) {
    try {
      const info = await stat(path);
      if (cutoff && info.mtimeMs < cutoff) continue;
      rows.push({ path, mtimeMs: info.mtimeMs, size: info.size });
    } catch {
      // A session can disappear while Codex rotates or archives it.
    }
  }
  rows.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(options.limit) || DEFAULT_LIMIT));
  return rows.slice(0, limit);
}

export function isAllowedTelemetryPath(filePath, codexHome = resolveCodexHome()) {
  const absolute = resolve(filePath);
  const root = resolve(codexHome);
  const relativePath = relative(root, absolute);
  return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
}

export async function parseRolloutFile(filePath, options = {}) {
  const absolute = resolve(filePath);
  const info = await stat(absolute);
  if (!info.isFile() || !isAllowedTelemetryPath(absolute, options.codexHome)) {
    throw new Error("The rollout file must be inside CODEX_HOME.");
  }

  const turns = new Map();
  const order = [];
  let currentTurnId = null;
  let sessionMeta = {};
  let latestTotals = null;
  let modelContextWindow = null;
  let latestTimestamp = null;
  let lineCount = 0;

  const input = createReadStream(absolute, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      lineCount += 1;
      const record = parseLine(line);
      if (!record) continue;
      const payload = record.payload;
      latestTimestamp = latestOf(latestTimestamp, Date.parse(record.timestamp));

      if (record.type === "session_meta" && payload) {
        sessionMeta = {
          sessionId: payload.session_id || payload.id || sessionMeta.sessionId,
          threadId: payload.parent_thread_id || payload.session_id || sessionMeta.threadId,
          cwd: payload.cwd || sessionMeta.cwd,
          cliVersion: payload.cli_version || sessionMeta.cliVersion,
          originator: payload.originator || sessionMeta.originator,
          modelProvider: payload.model_provider || sessionMeta.modelProvider,
        };
      }

      if (record.type === "turn_context" && payload) {
        currentTurnId = getTurnId(payload, currentTurnId);
        const turn = ensureTurn(turns, order, currentTurnId);
        if (turn) turn.modelContextWindow = nonNegative(payload.model_context_window) ?? turn.modelContextWindow;
      }

      if (record.type === "response_item" && payload?.type === "message") {
        const turnId = getTurnId(payload, currentTurnId);
        const turn = ensureTurn(turns, order, turnId);
        if (turn && payload.role === "user") turn.userMessage = true;
        if (turnId) currentTurnId = turnId;
      }

      if (record.type === "token_usage_record" && payload) {
        const turnId = getTurnId(payload, currentTurnId);
        const turn = ensureTurn(turns, order, turnId);
        const usage = usageShape(payload.usage || {});
        if (turn) {
          turn.usageRecords.push({
            timestamp: record.timestamp || null,
            responseId: payload.response_id || null,
            usage,
          });
          turn.usage = usage;
          turn.threadUsage = payload.thread_token_usage ? usageShape(payload.thread_token_usage) : turn.threadUsage;
        }
        latestTotals = payload.thread_token_usage
          ? usageShape(payload.thread_token_usage)
          : usage;
        if (turnId) currentTurnId = turnId;
      }

      if (record.type === "event_msg" && payload) {
        if (payload.type === "task_started") {
          currentTurnId = getTurnId(payload, currentTurnId);
          const turn = ensureTurn(turns, order, currentTurnId);
          if (turn) {
            turn.status = "running";
            turn.startedAtMs = msFromSeconds(payload.started_at) ?? turn.startedAtMs;
          }
        }
        if (payload.type === "task_complete") {
          currentTurnId = getTurnId(payload, currentTurnId);
          const turn = ensureTurn(turns, order, currentTurnId);
          if (turn) {
            turn.status = "completed";
            turn.completedAtMs = msFromSeconds(payload.completed_at) ?? turn.completedAtMs;
            turn.durationMs = nonNegative(payload.duration_ms) ?? turn.durationMs;
            turn.timeToFirstTokenMs = nonNegative(payload.time_to_first_token_ms) ?? turn.timeToFirstTokenMs;
          }
        }
        if (payload.type === "token_count") {
          const infoPayload = payload.info || {};
          const tokenUsage = infoPayload.last_token_usage || infoPayload.total_token_usage;
          const turn = ensureTurn(turns, order, currentTurnId);
          const usage = tokenUsage ? usageShape(tokenUsage) : null;
          if (usage) {
            latestTotals = usageShape(infoPayload.total_token_usage || tokenUsage);
            if (turn) {
              turn.tokenCount = usage;
              turn.usage = turn.usage || usage;
            }
          }
          modelContextWindow = nonNegative(infoPayload.model_context_window) ?? modelContextWindow;
          if (turn) turn.modelContextWindow = modelContextWindow ?? turn.modelContextWindow;
        }
      }
    }
  } finally {
    lines.close();
    input.destroy();
  }

  const turnsOut = order.map((turnId) => {
    const turn = turns.get(turnId);
    const usage = turn.usage || turn.tokenCount || emptyTotals();
    const limit = turn.modelContextWindow ?? modelContextWindow;
    const durationMs = turn.durationMs;
    return {
      ...turn,
      usage,
      modelContextWindow: limit,
      contextPercent: limit && usage.inputTokens !== null ? (usage.inputTokens / limit) * 100 : null,
      cacheHitPercent: usage.inputTokens && usage.cachedInputTokens !== null
        ? (usage.cachedInputTokens / usage.inputTokens) * 100
        : null,
      outputTokensPerSecond: durationMs && usage.outputTokens !== null
        ? usage.outputTokens / (durationMs / 1000)
        : null,
    };
  });

  const latestTurn = [...turnsOut].reverse().find((turn) => turn.usageRecords.length || turn.tokenCount || turn.usage.inputTokens !== null) || turnsOut.at(-1) || null;
  const summed = turnsOut.reduce((total, turn) => addUsage(total, turn.usage), emptyTotals());
  const totals = latestTotals || (turnsOut.length ? summed : emptyTotals());
  const sessionId = sessionMeta.sessionId || basename(absolute).replace(/^rollout-/, "").replace(/\.jsonl$/i, "");
  const lastActivityMs = latestTimestamp || info.mtimeMs;

  return {
    sessionId,
    threadId: sessionMeta.threadId || null,
    file: absolute,
    fileName: basename(absolute),
    archived: absolute.includes(`${sep}archived_sessions${sep}`),
    fileMtimeMs: info.mtimeMs,
    lastActivityMs,
    size: info.size,
    lineCount,
    cwd: sessionMeta.cwd || null,
    cliVersion: sessionMeta.cliVersion || null,
    originator: sessionMeta.originator || null,
    modelProvider: sessionMeta.modelProvider || null,
    modelContextWindow: modelContextWindow ?? latestTurn?.modelContextWindow ?? null,
    requestCount: turnsOut.reduce((count, turn) => count + turn.usageRecords.length, 0),
    turnCount: turnsOut.length,
    latestTurn,
    turns: turnsOut.slice(-Math.max(1, Number(options.maxTurns) || 20)),
    totals,
  };
}

export async function findRolloutFile(selector, options = {}) {
  const codexHome = resolveCodexHome(options.codexHome);
  if (selector && isAllowedTelemetryPath(selector, codexHome)) {
    try {
      const info = await stat(resolve(selector));
      if (info.isFile()) return resolve(selector);
    } catch {
      // Fall through to session-id matching.
    }
  }
  const files = await listRolloutFiles({ ...options, codexHome, limit: MAX_LIMIT });
  if (!selector) return files[0]?.path || null;
  const needle = String(selector).toLowerCase();
  return files.find((row) => row.path.toLowerCase().includes(needle))?.path || null;
}

export function formatTokens(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const n = Math.max(0, Number(value));
  if (n < 1000) return String(Math.round(n));
  if (n < 1000000) return `${(Math.round(n / 100) / 10).toFixed(1)}K`;
  return `${(Math.round(n / 100000) / 10).toFixed(1)}M`;
}

export function formatPercent(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? "—" : `${Number(value).toFixed(1)}%`;
}

export function formatDuration(ms) {
  return ms === null || ms === undefined || !Number.isFinite(Number(ms)) ? "—" : `${(Number(ms) / 1000).toFixed(1)}s`;
}

export function toMarkdown(report) {
  const latest = report.latestTurn;
  const lines = [
    `## agy-capsule`,
    "",
    `- Session: \`${report.sessionId}\``,
    `- Context: ${formatTokens(latest?.usage?.inputTokens)} / ${formatTokens(report.modelContextWindow)} (${formatPercent(latest?.contextPercent)})`,
    `- Cached input: ${formatTokens(latest?.usage?.cachedInputTokens)} (${formatPercent(latest?.cacheHitPercent)})`,
    `- Output: ${formatTokens(latest?.usage?.outputTokens)}; reasoning: ${formatTokens(latest?.usage?.reasoningOutputTokens)}`,
    `- Requests: ${report.requestCount}; turns: ${report.turnCount}`,
    `- Latest request speed: ${latest?.outputTokensPerSecond === null || latest?.outputTokensPerSecond === undefined ? "—" : `${latest.outputTokensPerSecond.toFixed(1)} tok/s (approx.)`}`,
    `- Last activity: ${new Date(report.lastActivityMs).toISOString()}`,
  ];
  if (latest?.durationMs !== null && latest?.durationMs !== undefined) {
    lines.push(`- Latest request timing: TTFT ${formatDuration(latest.timeToFirstTokenMs)}; total ${formatDuration(latest.durationMs)}`);
  }
  return lines.join("\n");
}

export async function getLatestReport(options = {}) {
  const file = await findRolloutFile(options.sessionId || options.file, options);
  if (!file) return null;
  return parseRolloutFile(file, options);
}

export async function listSessionReports(options = {}) {
  const files = await listRolloutFiles(options);
  const reports = new Map();
  for (const row of files) {
    try {
      const report = await parseRolloutFile(row.path, options);
      const previous = reports.get(report.sessionId);
      if (!previous || report.lastActivityMs >= previous.lastActivityMs || report.requestCount > previous.requestCount) {
        reports.set(report.sessionId, report);
      }
    } catch {
      // Skip files that are being rotated or are not readable anymore.
    }
  }
  return [...reports.values()].sort((a, b) => b.lastActivityMs - a.lastActivityMs);
}
