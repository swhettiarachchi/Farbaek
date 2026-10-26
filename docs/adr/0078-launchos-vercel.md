# ADR 0078: LaunchOS with Vercel

- Status: accepted (2026-10-25).
- Builds on ADR 0033 (the Launch Planner, the evidence chain and live checks) and ADR 0050 (the Launch Evidence Gate).
- Spec Stage 6:
  - one real provider adapter, the owner's choice after verifying its API;
  - the purchase and deploy authorization screen;
  - idempotent orders;
  - a lifecycle with health checks;
  - no deploy without a verified ProofPack or a logged override.

## Context

Farbaek Sites hosts static sites (ADR 0029), but projects with a server, such as Next.js apps, had nowhere to go. ADR 0033 left providers "Not connected", pending a choice of provider, a store for customers' credentials, and API details checked against current documentation. The owner asked for the recommended choice.

## Decision

**Vercel first.** It builds Next.js, Vite, Astro and static sites from source, and Farbaek already uses Vercel for sandboxes. Customers connect their own Vercel account, so Farbaek needs no account of its own, and Vercel bills the customer under their plan there. The endpoints and fields come from Vercel's REST reference, read on 2026-10-25:
- `GET /v2/user` checks whose token it is;
- `POST /v2/files` uploads each file, named by its SHA-1 in `x-vercel-digest`;
- `POST /v13/deployments`, with `target: "production"`, `skipAutoDetectionConfirmation=1` and files as `{ file, sha, size }`, creates the deployment;
- `GET /v13/deployments/{id}` returns `readyState`, `alias` and `errorMessage`.

**Tokens** (`src/server/launch/token-vault.ts`):
- **Sealing:** AES-256-GCM, with the workspace and provider as associated data, so a sealed token copied to another row doesn't open.
- **The key:** `PROVIDER_TOKEN_KEY` when set. Otherwise it's derived with HKDF from the server's Supabase secret, so nothing new has to be configured, and rotating that secret means reconnecting.
- **Who reads it:** column grants keep the sealed token from every browser; members see only the account name. Only the launch runner opens it, to call Vercel.
- **Who connects:** owners and admins, within the plan's integrations. Vercel must confirm the token first.

**Authorizing a launch** (`app_authorize_launch`, migration v48):
- One order for exactly the project's current files: their digest, count and size.
- The same evidence rule as publishing: verified, or an owner or admin's reason of 10 to 500 characters.
- A key made once per page, so pressing twice returns the same order.
- One launch per project at a time. An order with no progress for an hour counts as lost.
- The screen names the files, their fingerprint, the evidence, the account, the target (production) and how Vercel builds it. It says who pays. It needs the Vercel project's name typed to confirm.

**The lifecycle:**
1. Authorized.
2. Sending files: up to six uploads at once.
3. Building on Vercel: followed every 5 seconds for 20 minutes, then picked up again whenever the Launch page is opened.
4. Live or failed. A failure carries Vercel's reason and a link to its build log.

States only move forward, and a finished order doesn't change.

**The live check.** Once live, Farbaek fetches the public address once and records the status. That's the production alias, `<project>.vercel.app`, since the deployment's own address may sit behind Vercel's sign-in. A 401 or 403 is explained as Vercel's Deployment Protection, not shown as broken. Only https addresses on `vercel.app` are stored, linked or fetched.

**Purchases.** Nothing is bought through Farbaek, and the screen says so. Buying domains isn't part of LaunchOS yet; people add domains they own in Vercel.

## Consequences

- Projects with a server can go live from Farbaek, on the customer's own account, under the same evidence rule as Farbaek Sites.
- Farbaek holds customers' Vercel tokens, encrypted. Disconnecting deletes the token; the screen also suggests deleting it in Vercel.
- Netlify, Render, Railway and Fly.io stay "Not connected". Each would be another adapter behind the same orders.

**Addendum (2026-10-26):** Netlify is now the second provider, for static projects, behind the same connections and orders (ADR 0093, migration v59). The panel, forms and actions are provider-neutral.
