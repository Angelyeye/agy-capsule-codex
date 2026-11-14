# agy-capsule

Real-time context window and token usage monitor for Antigravity Desktop & IDE.

## Features
- **Ground-Truth Telemetry**: Reads exact API token counts (`uncached_input`, `cached_input`, `output_tokens`, `thinking_tokens`) directly from `~/.gemini/antigravity/conversations/<id>.db` (`gen_metadata` table).
- **Compaction-Aware**: Because it reads the actual token count billed by the model on the latest turn (`uncached_input + cached_input`), `/compact` and sliding-window truncations are reflected immediately on the next turn.
- **Composer Status Capsule**: Renders live context usage, cache expiry warnings, and remaining model quotas directly in the composer footer.
- **Local Font Fallbacks**: Prefers Source Han Sans, then the system UI font. Uses local fonts only, with no downloads or required font installation.
