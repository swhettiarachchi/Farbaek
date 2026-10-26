# Stage 69: LaunchOS with Netlify

The roadmap's "More hosting providers", and spec Stage 8 LaunchOS. Until now LaunchOS launched only to the workspace's own Vercel account (ADR 0078).

- **Decision record:** `docs/adr/0093-launch-netlify.md`.
- **Branch:** `feat/launch-netlify`, on top of `fix/security-txt-and-roadmap`.

## 2026-10-26

### Done

**Database: migration v59** (`20261130090000_netlify_launches.sql`).
- `provider_connections.provider` and `launch_orders.provider` allow `vercel` and `netlify`.
- An order's address and its link to the provider must be on that provider's own domain: `*.vercel.app` and `vercel.com` for Vercel, one `*.netlify.app` label and `app.netlify.com` for Netlify.
- A lost launch's failure names its provider.
- No new functions or tables: the browser grants are unchanged.

**Core.**
- `src/core/launch/providers.ts`: `LAUNCH_PROVIDERS`, `PROVIDER_NAMES`, `launchAddress`, `inspectorAddress`.
- `src/core/launch/netlify.ts`:
  - the site name rule (one subdomain label) and `netlifySiteName`;
  - `netlifyFit`, which allows static projects only and has a sentence for every other kind;
  - `netlifyPathProblem` for `#` and `?`;
  - the deploy states.

**Server.**
- `netlify-client.ts` covers Netlify's documented API: `/user`, `/accounts`, finding a site by name, creating a site, a deploy by SHA-1 digest, the upload of each file, the deploy's state, and the site's published deploy.
  - Only api.netlify.com is called, with no redirects.
  - Errors come back as sentences without the token.
  - An upload is tried again twice when Netlify doesn't answer.
- `netlify-launch.ts`: connect, authorize, run, follow and refresh.
  - The site is found by name, or made.
  - Netlify compares the files in the background above 100 files, and Farbaek waits for that.
  - Identical bytes go up once.
  - Ready counts as live only when the site publishes that deploy; otherwise the order fails with the locked-publishing sentence.
- `provider-launch.ts` now holds the shared steps: `connectProvider`, `disconnectProvider`, `authorizeLaunch`, `openProviderToken`, `failLaunch` and `mapLimit`. The Vercel functions are thin wrappers, and their tests are unchanged.
- `refresh.ts` picks up a building launch with its own provider.
- **The store** reads `provider` on orders and every connection in one read (`readConnections`).
- **The outcome watch** follows the latest ready launch of either provider (`judgeLaunch`). A 401 on Netlify counts as password protection.

**UI.**
- **Renamed:** `launch-actions.ts` (from `vercel-actions.ts`), `ProviderPanel` and the provider forms (from the Vercel ones).
- **`PROVIDER_COPY`** holds every word that differs: the token, the team, the name rule, "Publishing on Netlify", "Deploy on Netlify", what a protected address means, and the domain note.
- **The Launch page:**
  - shows a panel for each provider;
  - in "Where it can go", Vercel and Netlify say Connected or link to their panel;
  - "A launch is under way" counts every provider's launches, since one runs at a time.
- **Privacy page:** "such as Vercel or Netlify".

**Security.**
- SE-030, "A launch address outside the host's own domain".
- A threat model section for Netlify.

### Verified

- `pnpm typecheck` and `pnpm lint`: clean.
- **Full suite:** 1,859 passed, 17 skipped. New this stage:

  | Test file | Tests |
  | --- | --- |
  | `tests/db/netlify-launches.test.ts` | 4 |
  | `netlify.test.ts` | 6 |
  | `netlify-client.test.ts` | 7 |
  | `netlify-launch.test.ts` | 10 |
  | `provider-panel.test.ts` | 4 Netlify cases added |
  | `judgeLaunch` in `outcome-watch.test.ts` | 3 Netlify assertions added |
- **`pnpm security:eval`:** 30 scenarios, 30 passed.
- **Demo build, Launch page:**
  - Storefront (Next.js) shows the Vercel connect form and Netlify's reason it suits Vercel better.
  - The project Farbaek can't place shows each provider's own sentence.
  - The Vercel and Netlify cards link to their panels with 44px targets.
  - No sideways scroll at 375.
  - `qa:a11y`: 4 views, 0 findings. `qa:responsive`: 22 views, 0 findings.
  - No demo project is static, so the Netlify connect and launch forms were checked by `provider-panel.test.ts` only.
- **Migration v59** applied in production after its hash check. The four checks and the new stale-launch text were read back with psql.

### Not verified

- **A real Netlify deploy.** No Netlify account was used. The client follows Netlify's API docs (updated 2026-10-03) and OpenAPI reference, read 2026-10-26, and is tested against fakes of them. The first real launch needs a customer's or the owner's personal access token.

### Next

- Building before uploading: run the build in the sandbox, then send its output to Netlify. That would let Vite and Astro projects launch to Netlify too.
- Render, Railway and Fly.io deploy from a repository or a container image, so each needs more than an adapter.
