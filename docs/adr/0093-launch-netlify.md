# ADR 0093: LaunchOS with Netlify, for static projects

- Status: accepted (2026-10-26).
- Builds on ADR 0078 (LaunchOS with Vercel), ADR 0050 (the evidence gate), ADR 0080 (outcome watch) and ADR 0087 (member permissions).
- Migration v59 (`20261130090000_netlify_launches.sql`).

## Context

LaunchOS launched only to the workspace's own Vercel account. The Launch Planner already named Netlify, Render, Railway and Fly.io as "Not connected", and the roadmap listed more hosting providers. Vercel was hard-coded in the database checks, the store, the runner, the panel, the actions and the outcome watch.

What Netlify offers, from its API docs ("Get started with the Netlify API", updated 2026-10-03) and its OpenAPI reference, both read 2026-10-26:
- **A deploy by file digest.**
  1. `POST /api/v1/sites/{site_id}/deploys` takes `{ files: { "/path": sha1 } }`, with `async: true` for large deploys, and returns the deploy's `id` and `required`: the SHA-1s Netlify doesn't have yet.
  2. Each required file goes up with `PUT /api/v1/deploys/{deploy_id}/files/{path}`.
  3. `GET /api/v1/deploys/{deploy_id}` reports the state until it's `ready` or `error`.
- **Sites:** `POST /api/v1/sites` (or `/{account_slug}/sites` for a team), and `GET /api/v1/sites?name=`.
- **Who a token belongs to:** `GET /api/v1/user` and `GET /api/v1/accounts`.
- **No build.** The API deploy serves the uploaded files exactly as they are. Netlify builds only from a linked repository, or on the machine running its CLI.
- **Limits:** 500 requests a minute, and 3 deploys a minute and 100 a day for each account. File paths can't contain `#` or `?`.

Render, Railway and Fly.io all deploy from a repository or a container image. None takes a project's files directly, so each needs more than an adapter.

## Decision

**Netlify is the second provider, for static projects only.** It goes behind the same connections and orders as Vercel (v48), under the same rules:
- the token is checked with the provider, then sealed with AES-256-GCM to the workspace and the provider, so a sealed Vercel token can't be opened as Netlify's;
- only owners and admins connect, within the plan's integrations;
- the evidence gate applies: verified, or an owner or admin's reason;
- the name is typed to confirm;
- one key per authorization, and one launch per project at a time across providers;
- the `publish` permission (ADR 0087);
- progress only moves forward, and every step is audited.

**Fit.**
- A static project fits.
- Vite and Astro projects get a sentence saying they need a build first, and that Vercel builds them.
- Next.js, servers, Python and unknown projects each get their own reason.
- A project with `#` or `?` in a path is told which file.

**The run** (`src/server/launch/netlify-launch.ts`):
1. Name each file by its SHA-1.
2. Find the site with exactly the typed name in the account (or team), or create it.
3. Create a production deploy from the digest. Above 100 files, Netlify compares the files in the background first, as its own client does, and Farbaek waits for that.
4. Upload only the files Netlify asks for, each set of identical bytes once, five at a time, retrying twice if Netlify doesn't answer.
5. Follow the state for up to 20 minutes; the page picks it up after a restart.

**Live means published.**
- When the deploy is ready, Farbaek checks that the site's `published_deploy` is this deploy. If publishing is locked for the site in Netlify, the order fails with that sentence instead of claiming it's live.
- The address is always `https://<name>.netlify.app`, built from the validated name. The inspector link is the site's own admin address on `app.netlify.com`.

**Addresses stay on the provider's domain.**
- **The database (v59):** a Netlify order's address must match `^https://[a-z0-9-]+\.netlify\.app$`, and its link must be on `https://app.netlify.com/`. Vercel's rules are unchanged, and each provider's address is refused on the other's orders.
- **The code:** `launchAddress` and `inspectorAddress` (`src/core/launch/providers.ts`) apply the same rule before Farbaek links to an address or checks it.
- **Security scenario SE-030** tests both.

**Replacing a site is the person's choice.** Deploying to a name the account already uses replaces what that site serves, as Vercel does with a project name. The name field says so, and the typed confirmation stands.

**The outcome watch covers Netlify.** A 401 there counts as answering behind password protection; a 403 counts as down.

**The refactor.**
- `provider-launch.ts` keeps the shared steps: `connectProvider`, `disconnectProvider`, `authorizeLaunch`, `openProviderToken` and `failLaunch`. The Vercel functions are thin wrappers over them.
- The panel, forms and actions are provider-neutral (`ProviderPanel`, `PROVIDER_COPY`, `launch-actions.ts`).
- A third provider is one adapter, one copy entry and one database check.

## Not done

- **Building before uploading,** for example a Vite build in the sandbox with its output sent to Netlify. It would make Netlify fit more projects. It needs the sandbox to return build output as files, which is its own stage.
- **Render, Railway and Fly.io.** Each needs a repository or an image, as above.
- **Netlify Functions, forms and edge functions.** Only files are sent.
- **Untested live.** No Netlify account was used. The client follows Netlify's documented API and is tested against fakes of it. The first real launch needs a Netlify personal access token, which only a customer or the owner can create.
