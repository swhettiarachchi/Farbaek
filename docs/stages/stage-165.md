# Stage 165: Desktop app 0.10.0

- **Branch:** `feat/desktop-0.10`, from `main`.
- **Skills used:** `chrome-browser` for the builds and Partner Center.

## What's in it

- Every command on a person's own computer asks first (ADR 0175). Until now, commands classed read-only ran on their own.
- An MCP approval shows the whole input.
- Only known tests and builds run from a task sent to the computer, and the card says plainly that they run the project's own code.
- `.GIT` is treated as `.git`.
- The screens say plan, change, access and test space, and name pages as Farbaek does.

## What was built and checked

| File | Bytes | SHA-256 | Checked |
| --- | --- | --- | --- |
| `Farbaek-Agent-Setup-0.10.0.exe` | 114,124,010 | `5761f5bd…` | Built here. Starts, and its first screen reads correctly. |
| `Farbaek-Agent-0.10.0-mac.dmg` | 227,928,773 | `3685d361…` | GitHub's macOS runner: signed, notarized, stapled, Gatekeeper accepts it, still running 20 seconds after opening. |
| `Farbaek-Agent-0.10.0-linux-x86_64.AppImage` | 130,331,536 | `534e5b22…` | GitHub's Linux runner: still running 25 seconds after opening. |
| `Farbaek-Agent-0.10.0.appx` | 157,780,592 | `fbb2a527…` | Built here, with Partner Center's reserved identity. Certification is Microsoft's. |

Each downloaded file's fingerprint was compared with the one its build run reported.

## What only the owner can do

Auto mode refuses Claude's writes to the server and the Store's large upload, so:

1. Run `scripts/release/publish-desktop.ps1`. It restarts Auth with its new settings, and copies the three installers to the server with their fingerprints compared.
2. Merge this PR after that, because the page starts linking the new files as soon as it deploys.
3. In Partner Center, Submission 2 is an open draft: under Packages, drag in `Farbaek-Agent-0.10.0.appx` from the Desktop folder "Farbaek Store submission", remove 0.9.0, and submit.

**Until they update, people on 0.9.0 keep the old command rule.** The server's refusals (the pause, suspensions, access) reach them straight away.

**Not tested here:** a full run on a real second computer, on any of the three systems.
