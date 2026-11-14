# agy-capsule

Real-time context window and token usage monitor for Antigravity Desktop & IDE.

## Features
- **Ground-Truth Telemetry**: Reads exact API token counts (`uncached_input`, `cached_input`, `output_tokens`, `thinking_tokens`) directly from `~/.gemini/antigravity/conversations/<id>.db` (`gen_metadata` table).
- **Compaction-Aware**: Because it reads the actual token count billed by the model on the latest turn (`uncached_input + cached_input`), `/compact` and sliding-window truncations are reflected immediately on the next turn.
- **Composer Status Capsule**: Renders live context usage, cache expiry warnings, and remaining model quotas directly in the composer footer.
- **`/ctx` Slash Command Skill**: Run `/ctx` in chat at any time for an instant terminal/markdown report.
