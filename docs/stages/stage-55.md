# Stage 55: Downloading the desktop agent

Spec Stage 4 built the desktop agent, but customers had no way to get it. The Agents page said it builds from the repository, and the only installer, 0.1.0, predated the model gateway.

- **Decision record:** `docs/adr/0077-agent-downloads.md`.
- **Branch:** `feat/agent-download`, on top of `feat/arena` (PR #67).

## 2026-10-25

### Done

- **Installer 0.2.0** built from current code with `pnpm agent:dist`: 113,866,415 bytes, SHA-256 `c5bcb99e3e6f9561f5de6a620af949082a2cd7f3d7a955ea3d9b150b13224a71`, unsigned.
- **On the server:** copied to `/opt/farbaek/downloads`, where the SHA-256 matched the local build.
- **Caddy:**
  - serves `www.farbaek.com/downloads/*` from that folder, mounted read-only;
  - the folder isn't listed;
  - responses are attachments, with `nosniff` and a year's cache, since file names carry the version.
  - Validated with Caddy 2.10.2 on the server.
- **Agents page:** a "Get Farbaek Agent" card with the version, size and SHA-256, the PowerShell command to check it, the SmartScreen steps while it's unsigned, and why there's no Mac or Linux version yet. It replaces the "builds from the repository" notice.
- **`src/config/agent-download.ts`** is the one source for the release. A test ties it to the app's version and to the Caddy route.
- **Pairing:** the address field starts as `https://www.farbaek.com`, and a bare `farbaek.com` becomes www, since that address only redirects and the redirect would drop the agent's credentials.
- **Docs:** `docs/agent/README.md`, "Publishing a release".

### Verified

- **The app:** the production bundle started with a scratch data folder and showed the pairing screen with www filled in. A wrong code sent to production came back with "This code isn't valid, or it was already used or has expired". The window was closed afterwards.
- `src/config/agent-download.test.ts` (3) and `farbaek-client.test.ts` (4, including the www rule).
- **Demo build:** the card at 1280 and 375 px, with no sideways scroll; `pnpm qa:a11y` on `/app/agents`: 0 findings. At 375 px, the icon line and the PowerShell command didn't wrap well. Both are fixed after that build, to be seen in the next one.
- `pnpm typecheck` and lint are clean.

### Next

- **The owner:** a code-signing certificate, which takes the SmartScreen warning away. ADR 0077 says what changes then.
- **LaunchOS** with Vercel (Stage 6).
