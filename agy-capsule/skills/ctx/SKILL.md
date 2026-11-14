---
name: ctx
description: Displays exact real-time context window and token usage for the current or recent Antigravity conversations by reading the ground-truth gen_metadata table in conversations/<id>.db. Triggered by /ctx or when the user asks about token/context usage.
---

# Context Usage Reporter (`/ctx`)

Run the bundled Python script to inspect ground-truth API token telemetry from `~/.gemini/antigravity/conversations/<conversation-id>.db`:

```powershell
python "$HOME\.gemini\config\plugins\agy-capsule\skills\ctx\scripts\ctx_report.py" "<conversation-id>"
```

If `<conversation-id>` is omitted, the script automatically inspects the most recently active conversation database. Present the output clearly to the user, and if the `agy-capsule` UI sidecar is enabled, also include the pill `[AGY Capsule](sidecar://agy-capsule/agy_capsule/)` so they can toggle the live right-hand side panel.
