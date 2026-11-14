# agy-capsule

[中文](./README.md) | **English**

Context and quota capsules in the Antigravity composer footer.

<p align="center">
  <img src="assets/ctx-light.png" width="24%" alt="CTX: cache hit" />
  <img src="assets/ctx-warning-light.png" width="24%" alt="CTX: yellow warning after 3 minutes, about 1 minute until expiry" />
  <img src="assets/ctx-expired-light.png" width="24%" alt="CTX: red expiry indicator after 4 minutes" />
  <img src="assets/quota-light.png" width="24%" alt="Multi-model 5h and Weekly quotas" />
</p>

## Features

- **Inline dual capsules**: Embedded in the composer footer to show the current session's context usage and remaining 5h / Weekly quotas in real time.
- **Token breakdown**: Hover to see the proportions and token counts for `Turn0`, `Read`, `Think`, and `Write`.
- **Cache expiry alerts**: Turn yellow 3 minutes after the last turn with a countdown (`~1m`), and turn red at 4 minutes to mark `Cache` as expired.
- **Multi-model quota panel**: Automatically match the model selected in the footer (such as `Gemini`, `Claude`, `Argon`, or `Carbon`). Hover to see each group's remaining 5h and weekly quotas, plus reset countdowns.
- **Local font fallbacks**: Prefer Source Han Sans, falling back to the system UI font when unavailable; no font downloads or extra installation required.
- **Light / dark adaptation & cross-version compatibility**: Reuse the host's CSS variables directly; mount via a native Sidecar and CDP without modifying client source code, so it keeps working after client updates.

## Installation

1. Copy the [`agy-capsule`](./agy-capsule) folder into the Antigravity plugins directory:
   - **Windows**: `%USERPROFILE%\.gemini\config\plugins\agy-capsule`
   - **macOS / Linux**: `~/.gemini/config/plugins/agy-capsule`
2. Enable **agy-capsule** in Antigravity's **Plugins** panel.

## Notices

- **Cache expiry is an estimate**: The cache status indicator (yellow warning at 3 minutes / red expired at 4 minutes) is estimated locally based on elapsed time since the last turn and is for reference only; actual cache hits depend on the server.
- **Tested environments & feedback**: Currently tested only on **Windows + Pro plan**. Testing, feedback, and PRs on **macOS** and **Ultra plan** environments are very welcome!
- The Gemini mascot illustration is by [ZipZipPipe](https://space.bilibili.com/4168597); related character assets are licensed under **CC BY-NC-SA 4.0 (Attribution-NonCommercial-ShareAlike)**.

## License

[MIT](./LICENSE)
