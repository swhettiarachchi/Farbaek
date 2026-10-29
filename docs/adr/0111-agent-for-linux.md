# ADR 0111: Farbaek Agent for Linux, an AppImage

- Status: accepted (2026-10-29).
- Builds on ADR 0077 (downloads from Farbaek's own server) and ADR 0098 (installing without a warning). No migration.

## Context

Farbaek Agent shipped for Windows, with a notarized Mac build waiting for GitHub's macOS minutes. ADR 0077 left Linux out because it needs its own build machine. The agent already supports Linux:
- it reports its platform as `linux`;
- Nearby works there;
- it refuses to keep its token when Linux has no real keyring (`safeStorage` falling back to `basic_text`), and says so.

So only the package was missing.

## Decision

**An AppImage for x64** (`desktop/electron-builder.yml`, `Farbaek-Agent-<version>-linux-x86_64.AppImage`). It runs on most distributions without installing, and Linux doesn't need signing for people to open it.

**Built on GitHub's Linux runner** (`.github/workflows/agent-linux.yml`), which counts its minutes once, not ten times as the Mac's do. The run:
- builds the app and packages it;
- opens it under a virtual display, with a GNOME keyring unlocked, and checks it's still running 25 seconds later;
- keeps the file and its SHA-256 as the run's artifact for 7 days.

It runs when the agent's version or build settings change, or by hand.

**Published like the Windows installer**: copied to `/opt/farbaek/downloads` in one SSH connection with its SHA-256 compared, then named in `AGENT_LINUX` (`src/config/agent-download.ts`). Until then the Agents page says the Linux version is on its way. Once set, it offers the download with the `sha256sum` command and the fingerprint to check, and says the agent needs a desktop keyring (GNOME Keyring or KWallet).

## Consequences

- Linux joins Windows and Mac with no new dependency and no signing step.
- **Not verified yet:** the first build waits for GitHub's minutes (November 1), and the AppImage hasn't run on a real Linux desktop. The check is pairing and one Review Only run.
- **No `.deb` or `.rpm`:** an AppImage covers the distributions without a package per family. A package can follow if people ask.
