# Stage 88: Farbaek Agent for Linux

The desktop agent covered Windows (installer and Store) and Mac (notarized, waiting for macOS minutes). This stage adds Linux.

- **Decision record:** `docs/adr/0111-agent-for-linux.md`.
- **Branch:** `feat/agent-linux`.

## 2026-10-29

### Done

- `desktop/electron-builder.yml`: an x64 AppImage, `Farbaek-Agent-<version>-linux-x86_64.AppImage`, with the app's icon.
- `.github/workflows/agent-linux.yml`: builds on GitHub's Linux runner, opens the app under a virtual display with a keyring, checks it stays up, and keeps the file and its SHA-256.
- `AGENT_LINUX` in `src/config/agent-download.ts`. Once it's set, the Agents page offers the download with its `sha256sum` check. Until then, it says the Linux version is on its way.
- `docs/agent/README.md`: the publishing steps include Linux.

### Verified

- `agent-download.test.ts` (5): the Linux entry is well formed when set, and the build's file name matches what the page offers.
- The YAML files parse.
- Typecheck, lint, and the full suite.

### Not verified yet

- The first build waits for GitHub's minutes (November 1).
- The AppImage hasn't run on a real Linux desktop.

### Next

- After 1 November, run "Agent for Linux" and publish the AppImage with its SHA-256.
- Set `AGENT_LINUX`.
