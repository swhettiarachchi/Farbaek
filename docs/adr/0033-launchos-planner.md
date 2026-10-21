# ADR 0033: LaunchOS A, the Launch Planner, the evidence chain and live checks

- Status: accepted (2026-10-21).
- Spec: §12 (LaunchOS) and Stage 6.

## Context

LaunchOS is the spec's controlled path from a verified project to a running service: a planner, provider adapters, explicit purchase and deploy authorization, a lifecycle with health checks, and an evidence gate.

Farbaek already hosts static sites itself (Farbaek Sites, ADR 0029). Connecting a provider (Vercel, Netlify, Render, Railway, Fly.io) needs:
- the owner's choice of provider;
- a customer-credential store;
- verified API and pricing data.

None of those exist yet. The spec forbids invented endpoints and unverified prices.

## Decision

Build the parts that need no provider, no keys and no money.

**The Launch Planner** (`src/core/launch/planner.ts`):
- **What it decides:** the project's kind, its hosting (static or server), its build, output and start commands, its Node.js version, the setting names it reads, the services it uses, plain notes, and where it can go.
- **Evidence:** each decision names what it came from. A command is either found in the project or marked as the framework's usual default.
- **Names only:** from example env files and from code (`process.env`, `import.meta.env`, `Deno.env`, Python's `os.environ`). Values are dropped as each line is read. Public prefixes are flagged as visible in the browser, and a public name that looks like a secret gets a warning.
- **Providers:** listed as "Not connected", with what each suits. There are no prices.

**The evidence chain:** the Launch page shows four steps, each as Done, Needs a look, Missing or Not needed yet, in words and with an icon:
1. the security check of exactly these files;
2. the latest change's ProofPack;
3. the live version's digest;
4. the live check.

Publishing to Farbaek Sites keeps its existing gate: a clean security check of exactly those files. The ProofPack is shown, not required, because static sites edited by hand have none. Provider launches, when they come, will require a verified ProofPack or a logged override, as the spec says.

**Live checks:**
- **The header:** the site server names the live deployment in `x-farbaek-deployment`, and each file's ETag is its SHA-256.
- **The fetch:** Farbaek fetches `https://<name>.<site domain>/`:
  - the address is built only from a validated name and the configured domain;
  - redirects aren't followed;
  - the timeout is 8 s;
  - the body is never read.
- **The verdict:** a site is "live" only when the version and the home page's hash both match. "previous" means an earlier version is still cached, and the check tries again (3 tries, 4 s apart). The other verdicts are "down" and "unreachable".
- **Recording:** results go into `site_health_checks` (migration v24) through `app_record_site_health`, which checks membership and that the deployment is the site's, and limits each site to 6 checks a minute. Members read the results through RLS.

## Consequences

- People see what their project needs before any hosting choice, and a live site is confirmed by what actually answers, not by a publish having succeeded.
- The deployment id is now visible in a response header. It's an id, not a secret, and it grants nothing.
- A check runs once by itself when the live version has never been checked, and again on request. It doesn't run on a schedule.
- **Next in LaunchOS:**
  - the owner picks a first provider, and we connect customer-owned accounts with credentials stored server-side, never shown;
  - a purchase and deploy authorization screen with exact, verified amounts;
  - idempotent orders;
  - provider-confirmed status.
