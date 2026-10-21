# Stage 8: LaunchOS

The spec's LaunchOS (§12) takes a verified project to a running service under explicit control. This stage starts with what needs no provider account, no keys and no money.

- **Plan:** approved 2026-10-21.
- **Decision record:** `docs/adr/0033-launchos-planner.md`.

## 2026-10-21: LaunchOS A, the Launch Planner, the evidence chain and live checks

### Done

**Launch Planner** (`src/core/launch/planner.ts`): reads a project's own files and says:
- **What it is:** a static site, Next.js, Vite, Astro, a Node.js server, Python, or unknown, with the evidence for each.
- **How it runs:** build, output and start commands, each marked as found in the project or assumed from the framework's default, plus the Node.js version.
- **Settings it needs, names only:**
  - from `.env.example` and the code;
  - values dropped as each line is read;
  - public prefixes flagged as visible in the browser;
  - a public name that looks like a secret gets a warning.
- **Services it uses:** database, sign-in, payments, file storage, email and AI.
- **Where it can go:** Farbaek Sites (available for static sites, with the reason otherwise), and Vercel, Netlify, Render, Railway and Fly.io as "Not connected", with what each suits. There are no prices.

**Launch page** (`/app/projects/[id]/launch`, linked as "Launch plan" from the project page):
- the plan, with evidence chips;
- notes;
- the evidence chain: security check, latest ProofPack, live version, then the live check;
- how it runs, settings and services;
- destinations;
- every version with its latest check.

**Live checks:**
- **The header:** published sites now send `x-farbaek-deployment`.
- **The check:** fetches the real address and calls a site live only when the version and the home page's SHA-256 both match. It tries again while the old version is cached.
- **Recording:** results go into `site_health_checks` (migration v24) with a limit of 6 a minute per site.
- **When it runs:** once by itself when the live version has never been checked, and from "Check again".

**Roadmap:** the "LaunchOS" lock now reads "LaunchOS: your own hosting".

### Verified

- Unit tests:
  - the planner (8): every kind, commands found and assumed, names from the example file and the code with no values kept, public flags, services, destinations, and agreement with the starters' run profile;
  - live checks (3 in core, 3 on the server): each verdict, the retry, the address rules, recording and refusals.
- `serve.test.ts`: served files carry the deployment id and a SHA-256 ETag.
- PGlite `site-health.test.ts` (3): a member records and reads; non-members, other sites' deployments, unknown verdicts and a seventh check in a minute are refused; browsers can't call the function or insert.
- `pnpm typecheck`, `pnpm lint` and `pnpm build` pass. Full `pnpm test`: 999 passed.
- **The real probe against the live domain:** `test.farbaek.si` answered 404 ("down", 1.9 s) and an unresolvable address came back "unreachable". No site is published on farbaek.si right now, so a "live" verdict against a real site waits for one.
- **Layout:** a static render of the Launch page with sample data, for a static site and a Next.js app, at 375px and 1100px. No horizontal scroll. Copy fixed from it:
  - the Farbaek Sites card;
  - the server and unknown reasons;
  - older versions' check wording.

### Applied to the hosted database (2026-10-21)

Migration v24 went in through the SQL Editor on the owner's dashboard, after checking the editor's contents had the tested file's SHA-256 (`9aa9f024…26b3`, 3,606 bytes). Read-only checks afterwards:
- row level security is on, with one read policy;
- `app_record_site_health` runs for the service role only, not for anon or authenticated;
- authenticated can't insert, and anon can't read the table.

### Not done yet

- **A real "live" verdict:** that needs a site published on farbaek.si after this deploys.
- **Provider connections:** they need the owner's choice of provider. Purchase and deploy authorization and idempotent orders come with them.
