# 0023. Previews: project files instantly, and running apps through a signed relay

- Status: accepted
- Date: 2026-10-18
- Updates: ADR 0016 (previews were off on Vercel Sandbox)

## Context

People building on Farbaek need to see what they built.

Sandbox previews already existed (ADR 0013). Each app gets its own preview host, `p-<id>.<preview domain>`, behind a one-use launch link and a host-only cookie, so app code never runs next to Farbaek's cookies. But they had two gaps:
- On Vercel Sandbox (ADR 0016) they were off: Vercel serves exposed ports on public addresses with no sign-in.
- A static website needed a whole sandbox just to be looked at.

## Decision

- **Project previews.** A preview can point at a project instead of a sandbox session (migration 17).
  - The preview gateway serves the project's current files as they are: `/` is `index.html`; `/about` can be `about`, `about.html` or `about/index.html`. Reads only (GET and HEAD), never above the project root, with no caching.
  - Any member can preview a project's files, since they can read them. Launch, cookie, expiry and revocation work as for session previews. Launch also stops at an archived project.
  - The project page has a Preview button. No sandbox runs and nothing runs on Farbaek's side.
- **The signed relay** (`src/core/sandbox/relay.ts`) keeps previews private where a runtime exposes ports publicly.
  - Farbaek exposes one port (3999) per sandbox, where a dependency-free Node relay runs. It forwards a request to the app on `127.0.0.1:<port>` only when the preview gateway signed it.
  - The key is HMAC-derived per sandbox from the preview secret and stored in a file only the sandbox user can read.
  - The signature covers the method, path, target port, a timestamp (60 seconds) and a nonce (one use).
  - The relay refuses its own port, ports below 1024 and upgrades.
  - App ports are never exposed. The gateway signs only after it has checked the person's access, so the public address alone opens nothing.
  - On Vercel, previews are on when `SANDBOX_PREVIEW_SECRET` is set.
- **Start app / Stop app** in the preview panel run the app in its own process group, with its log in `/tmp/farbaek/app.log`. They are ordinary sandbox commands, so the guard, limits and receipts apply.

## Consequences

- Websites built by the agent can be looked at right after the change is applied, with no sandbox time used.
- **What the relay doesn't change.**
  - Code inside the sandbox can read the relay key, so it can sign requests to its own relay. That gives it nothing it didn't already have.
  - A leaked key opens only that sandbox's relay, for its lifetime.
- **Not covered yet.**
  - WebSockets, and with them hot reload, aren't relayed; people reload the preview.
  - Previews of a proposal before it's applied (overlaying the proposed files) aren't built yet.
