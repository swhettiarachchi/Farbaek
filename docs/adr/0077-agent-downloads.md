# ADR 0077: Downloading the desktop agent

- Status: accepted (2026-10-25).
- Its notes that the agent is Windows only and unsigned are superseded by ADR 0098: the Microsoft Store for Windows, and a Mac build signed and notarized by Apple.
- Builds on ADR 0018 (the Farbaek Agent) and ADR 0035 (hosting on the VPS).

## Context

The desktop agent was built and checked live, but customers had no way to get it. The Agents page said it builds from the repository with `pnpm agent:dist`. The only installer, 0.1.0 from 18 October, predated the model gateway (ADR 0021). The repository is private, so GitHub Releases can't serve it publicly.

Code signing needs a Windows Authenticode certificate, a paid identity check in the owner's name. Mac and Linux builds need their own build machines, and macOS also needs an Apple Developer ID. Only the owner can arrange either.

## Decision

**Served from Farbaek's own server.**
- Caddy serves `https://www.farbaek.com/downloads/<file>` from `/opt/farbaek/downloads`, mounted read-only into the Caddy container. The folder isn't listed.
- Responses carry `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- File names carry the version, so a published file never changes, and it's cached for a year.

**One source of truth for the release:** `src/config/agent-download.ts` holds the version, file name, size and SHA-256 of the installer on the server. The Agents page shows all four with the download button, so anyone can check the file they got. A test keeps the entry well formed.

**Honest about signing.** The page says the installer isn't code-signed yet. It explains that Windows SmartScreen shows "Windows protected your PC", and that "More info", then "Run anyway", continues. It says to check the SHA-256 first.

**Windows only for now.** Mac and Linux are named as not available yet, with the reason.

**Pairing goes straight to www.** The agent's address field starts as `https://www.farbaek.com`. A bare `farbaek.com` becomes www, because the bare domain only redirects, and a redirect to another origin drops the agent's credentials.

**Publishing a release:**
1. `pnpm agent:dist`.
2. Copy the installer to `/opt/farbaek/downloads` over SSH.
3. Compare its SHA-256 on the server with the local one.
4. Update `agent-download.ts`.
5. Merge.

## Consequences

- Customers can install the agent today from a page that names exactly what they download.
- About 110 MB per version on the server's disk. Old versions stay until removed by hand, so links in old emails keep working.
- When the owner gets a signing certificate, the installer is signed during `agent:dist` and the warning text comes off the page. Nothing else changes.
