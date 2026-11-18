import { getLatestReport, listSessionReports, parseRolloutFile, findRolloutFile, toMarkdown } from "../lib/usage.mjs";

const args = process.argv.slice(2);
const command = args[0] || "report";

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const format = valueAfter("--format") || "markdown";
const options = {
  codexHome: valueAfter("--codex-home"),
  sessionId: valueAfter("--session-id"),
  file: valueAfter("--file"),
  days: Number(valueAfter("--days")) || undefined,
  limit: Number(valueAfter("--limit")) || undefined,
  maxTurns: Number(valueAfter("--max-turns")) || undefined,
};

let result;
if (command === "report") {
  result = await getLatestReport(options);
} else if (command === "list") {
  result = await listSessionReports(options);
} else if (command === "inspect") {
  const file = await findRolloutFile(options.file || options.sessionId, options);
  if (!file) throw new Error("The requested Codex session was not found under CODEX_HOME.");
  result = await parseRolloutFile(file, options);
} else {
  throw new Error(`Unknown command: ${command}. Use report, list, or inspect.`);
}

if (!result) {
  console.error("No Codex rollout telemetry was found under CODEX_HOME.");
  process.exitCode = 1;
} else if (format === "json") {
  console.log(JSON.stringify(result, null, 2));
} else if (Array.isArray(result)) {
  console.log(result.map((item) => toMarkdown(item)).join("\n\n---\n\n"));
} else {
  console.log(toMarkdown(result));
}
