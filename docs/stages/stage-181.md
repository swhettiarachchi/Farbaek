# Stage 181: Launching apps to Render, Railway and Fly.io

- **Branch:** `feat/server-hosting`, from `main` (e0f64fb).
- **ADR:** 0191.
- **Migration:** v92, `supabase/migrations/20270102090000_server_hosting.sql`. It goes to production before the merge.
- **Skills:**
  - **Research:** `deep-research`. Each host's official reference was read first, and only confirmed calls are used.
  - **APIs:** `api-design`, for the clients and their refusals.
  - **Security:** `ecc-security-review`, for tokens, addresses and the GitHub branch.
  - **Screens:** `farbaek-ui`, for the Launch page words.

## What the owner asked

"Hosting on Render, Railway or Fly.io" was one of the six parts not built, and the owner said "setup all and use skills".

## Sources (official, read 2026-11-12)

- **Render:** https://api-docs.render.com (owners, create service, update service, create and retrieve deploy) and https://render.com/docs/web-services, https://render.com/docs/free.
- **Railway:** https://docs.railway.com/guides/public-api, its manage-projects, manage-services, manage-domains and manage-deployments guides, and the live schema at https://backboard.railway.com/graphql/v2 (introspection, read only).
- **Fly.io:** https://docs.fly.io/machines/api/ and the OpenAPI at https://docs.fly.io/api/machines/openapi.json (apps, machines, `ip_assignments`, wait).

## What changed

- **Clients:** `render-client.ts`, `railway-client.ts` and `fly-client.ts`, each with tests against a fake network:
  - only confirmed calls;
  - ids validated before they go in a path;
  - tokens never in a message;
  - addresses only on the host's own domain.
- **The launch commit:** `src/server/github/launch-commit.ts` writes exactly the authorized files as one commit on `farbaek/launch`, reads the tree back and compares it, records the commit, then moves the branch only as a fast-forward from one of the last three commits Farbaek recorded.
- **The linked repository** (`provider-wiring.ts`): the one that was linked, by GitHub's id, not archived, and writable with the workspace's token.
- **The runs:** `src/server/launch/server-launch.ts` connects, authorizes, runs and follows each host:
  - **Render:** a free web service with automatic deploys off, the port and install scripts off in its variables, and the commit deployed by id. A new service's own first deploy is the one followed, and each deploy is checked to be of the launch commit.
  - **Railway:** a project, then an empty service given its variables and commands before the repository is connected, automatic deploys off, a domain, then the commit deployed.
  - **Fly.io:** an app, public addresses, and a machine on Node's own image, tagged as Farbaek's.
  - **Each host's things that aren't Farbaek's are left alone:** a Render service with another repository, a Railway service that builds another repository or none, a Fly.io app in another organization or with machines Farbaek didn't make.
- **Fit and commands:** `src/core/launch/servers.ts` decides which projects fit which host and the commands they run. Static sites go to Vercel, Netlify or Farbaek Sites, and Fly.io takes only small apps with no install or build.
- **Migration v92:** the three hosts in the provider checks, their address and dashboard rules, the launch commit on an order, and the lost-launch wording.
- **The Launch page:**
  - the three hosts can be connected and launched to;
  - each says what it runs and why a project doesn't fit;
  - the words cover cost, sleeping free instances and disks wiped on redeploy.
- **Words elsewhere:** Billing, the privacy page, the outcome watch and the public status list name the new hosts. "More hosting providers" left the roadmap.

## Verified

- **Independent review:** a fresh agent read the risky files before the PR, as for stages 157 and 158. What it found is fixed here:
  - a lost answer from GitHub could strand the branch;
  - a repository recreated under the same name would have been written to;
  - Render could deploy a second, different commit;
  - Railway built before its variables were set, and deployed on every push;
  - each host could take over a service or app by that name that wasn't Farbaek's;
  - install scripts ran on the host;
  - Fly.io tokens failed the shape check.
- **Unit tests (60):**
  - the three clients (Render 11, Railway 13, Fly.io 14);
  - the launch commit (6): git's blob id, first launch, fast-forward, a moved branch refused, a planted file refused, the commit recorded before the branch moves;
  - the runs (10): each host end to end with fakes, the order Railway is set up in, a missing repository, and each host's service or app that isn't Farbaek's left alone;
  - the fit rules and commands (6).
- **PGlite** (`tests/db/server-hosting.test.ts`, 3): each host's address and dashboard link on its own domain, the launch commits recorded and found, the lost-launch wording, the new functions closed to browsers.
- **Whole suite:** 2,970 tests pass (17 skipped). Typecheck and lint are clean.

## Not done

- **A launch to a real account:** none of the three has been tried yet. A free Render account is the cheapest first check, and it's the owner's to create.
- **Unconfirmed in the docs:**
  - whether Render or Railway deploy a public repository without their GitHub app;
  - Fly.io's configuration size limit;
  - Railway's switch for automatic deploys and a service's repository, which are in its live schema but not its guides.
- **Fly.io with a Dockerfile,** for apps with dependencies.
- **Python apps on Render and Railway.**
