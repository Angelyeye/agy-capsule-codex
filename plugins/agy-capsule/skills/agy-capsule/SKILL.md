---
name: agy-capsule
description: Inspect Codex context-window usage, cache hits, token breakdowns, request timing, generation speed, and recent rollout sessions from local telemetry. Use when the user asks how much context or quota is being used, how many tokens a Codex turn consumed, whether cache is helping, or wants a usage report.
---

# agy-capsule for Codex

This is the Codex port of the original Antigravity agy-capsule. It keeps the
telemetry and presentation goal, but uses Codex rollout JSONL instead of
Antigravity CDP and Gemini SQLite files.

## Data and boundaries

- Use the `agy_capsule_get_usage` MCP tool for the latest session.
- Use `agy_capsule_list_sessions` to compare recent sessions.
- Use `agy_capsule_inspect_session` when the user names a session.
- These tools are local and read-only. They do not send rollout contents to a
  network service and do not modify Codex files.
- Report that generation speed is approximate when it is derived from
  `task_complete.duration_ms`; Codex does not expose the original Sidecar's
  exact streaming timing in every rollout.
- Treat absent or null fields as unknown (`—`), not as zero.
- Never print credentials or copy arbitrary rollout text into the answer.

## Response shape

Lead with the requested number, then include the smallest useful breakdown:

1. Context input tokens and model context window, with percentage.
2. Cached versus uncached input and cache-hit percentage.
3. Output and reasoning tokens.
4. Request count and latest request timing/speed when available.

When comparing sessions, use a compact table with session id, last activity,
context percentage, input/output totals, and request count. Mention that
rollout telemetry is an implementation detail and may change across Codex
versions.

## CLI fallback

When MCP tools are unavailable, run the plugin-local command from its installed
directory:

```text
node scripts/agy-capsule.mjs report
node scripts/agy-capsule.mjs list --days 7 --limit 10
node scripts/agy-capsule.mjs inspect --session-id <id>
```

Use `--format json` when another local tool needs structured data.
