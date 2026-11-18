# agy-capsule for Codex

This directory is the Codex-native port of the original Antigravity plugin.
It exposes local, read-only telemetry through a Codex skill, three MCP tools,
and a small Node.js CLI.

## What migrated

- Context window usage from Codex `token_count` events
- Input, cached input, output, reasoning, and total token counts
- Cache-hit percentage
- Recent request count and timing
- Approximate output speed when Codex records turn duration
- Recent and archived session discovery

## What did not migrate

The original composer footer, Antigravity DevTools/CDP injection, Gemini
conversation SQLite reader, quota RPC calls, and Antigravity Sidebar settings
are host-specific and are intentionally not copied into the Codex package.

## Local development

From this directory:

```text
npm test
npm run report
npm run list
```

The parser reads `%CODEX_HOME%` when set, otherwise `%USERPROFILE%\.codex`.
It only accepts rollout files below that directory.

## Install from this repository

Register the repository root as a local marketplace, then install the plugin:

```text
codex plugin marketplace add D:\Codex\agy-capsule-codex
codex plugin add agy-capsule@agy-capsule-local
```

Restart Codex after installation if the plugin does not appear immediately.
