# Stage 56: LaunchOS with Vercel

Spec Stage 6 asks for one real provider adapter, the deploy authorization screen, idempotent orders, a lifecycle with health checks, and the evidence gate. The owner asked for the recommended provider: Vercel.

- **Decision record:** `docs/adr/0078-launchos-vercel.md`.
- **Branch:** `feat/launch-vercel`, on top of `feat/agent-download` (PR #68).

## 2026-10-25

### Done

- **Vercel's API** was checked against its current reference: `GET /v2/user`, `POST /v2/files`, `POST /v13/deployments` and `GET /v13/deployments/{id}`.
- **`src/core/launch/vercel.ts`:**
  - project names and build settings from the Launch Planner;
  - which projects Vercel suits;
  - the digest of exactly the files sent;
  - what Vercel's states mean;
  - addresses limited to https `*.vercel.app`, with the public production alias preferred.
- **`src/server/launch/`:**
  - the token vault (AES-256-GCM, bound to workspace and provider, key from `PROVIDER_TOKEN_KEY` or derived with HKDF);
  - the Vercel client (api.vercel.com only, no redirects, time limits, errors as sentences without the token);
  - the store, the use cases (connect, disconnect, authorize, run, follow, refresh) and the wiring.
- **Migration v48** (`20261119090000_provider_launches.sql`):
  - `provider_connections`, with column grants so no browser reads the sealed token;
  - `launch_orders`, with one per key, the evidence gate, one running per project, forward-only states, an hour's stale rule and the live check.
  - **Applied in production** and read back.
- **The Launch page:**
  - the Vercel card shows the connection;
  - "Launch to Vercel" has the connect form, the authorization (what goes, the evidence, the account, production, how Vercel builds it, who pays, the name typed to confirm, and a reason when not verified) and the launches with live states, links and the live check;
  - it says that nothing is bought.
- **The Privacy Policy** says files go to the customer's own hosting account only on launch, and how the token is kept.
- **The threat model** has a LaunchOS with Vercel section.

### Verified

- `vercel.test.ts` (7), `token-vault.test.ts` (3), `vercel-client.test.ts` (4), `provider-launch.test.ts` (9), `vercel-panel.test.ts` (6), `tests/db/provider-launches.test.ts` (8).
- `pnpm typecheck` and lint are clean; the design tests pass.
- Demo build: the Launch page at 1280 and 375 px (the connect form, and the reason for a project Vercel can't classify), with no sideways scroll. `pnpm qa:a11y` on Launch and Privacy: 0 findings.
- Full `pnpm test`: 1,606 passed. Two failed under load and pass alone: the known broker flake, and an executor autonomy test, flagged for its own investigation.
- **Not yet done:** a launch against a real Vercel account. It needs a customer's token, which Claude never handles, so it's the owner's check: connect a token on a project's Launch page, then launch.

### Next

- **The owner** (optional): set `PROVIDER_TOKEN_KEY` (32 random bytes, base64) on the server for a key of its own. Without it, the key is derived from the Supabase secret.
- **Spec Stage 7:** native mobile apps.
