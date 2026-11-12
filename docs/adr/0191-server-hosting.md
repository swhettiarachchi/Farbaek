# ADR 0191: Launching apps to Render, Railway and Fly.io

- **Status:** accepted
- **Date:** 2026-11-12
- **Stage:** 181
- **Builds on:** ADR 0078 (LaunchOS with Vercel), ADR 0093 (Netlify), ADR 0126 (GitHub pull requests), ADR 0190 (the App with sign-in).

## Context

LaunchOS sent static sites to Vercel and Netlify. An app that runs a server, such as the App with sign-in or the REST API starter, had nowhere to go, though the spec names Render, Railway and Fly.io. ADR 0093 noted they "deploy from a repository or a container image… each needs more than an adapter". The spec also says never to invent an endpoint.

## Decision

**Only calls confirmed in each host's official reference** (read 2026-11-12; the sources are in the stage doc). Anything that couldn't be confirmed is named here as a limit.

**Render and Railway build from a commit in the project's linked GitHub repository:**
- **The commit:** Farbaek writes exactly the authorized files as one commit on its own branch, `farbaek/launch` (`launch-commit.ts`):
  - a fresh tree, with text inline and images as blobs, built in steps of about 2 MB;
  - read back recursively, and compared with git's id for every file's bytes before anything is committed;
  - the default branch is never touched.
- **The repository:** the very one that was linked, checked by GitHub's own id (a deleted repository recreated under the same name is someone else's), not archived, and writable with the workspace's token.
- **The branch:** it moves only as a fast-forward (`force: false`) from one of the last three commits Farbaek recorded for the project (`app_recent_launch_commits`, migration v92). Each commit is recorded on the order before the branch moves, so a move whose answer from GitHub was lost still counts as Farbaek's. If someone else moved it, the launch stops and says so.
- **Render:** a web service on Render's free instance (`plan: free` is sent explicitly, because leaving it out picks a paid plan). It has automatic deploys off, its repository and branch, `PORT=8080`, `NPM_CONFIG_IGNORE_SCRIPTS=true` and the commands below.
  - A new service's own first deploy is the one followed, so no second deploy starts. An existing one gets that commit deployed by its id.
  - Each deploy is checked to be of exactly the launch commit, and followed to `live`.
  - Only a service with this repository and the launch branch is reused. Any other service by that name is left alone, and the launch says to choose another name.
- **Railway:** a project, and a service made empty so nothing builds before it's set up:
  1. `PORT=8080` and `NPM_CONFIG_IGNORE_SCRIPTS=true` (`variableCollectionUpsert`, with deploys skipped);
  2. the commands;
  3. the repository and branch (`serviceConnect`);
  4. automatic deploys off (`serviceInstanceAutoDeployUpdate`);
  5. a generated `*.up.railway.app` domain on port 8080;
  6. that commit deployed (`serviceInstanceDeployV2`) and followed to `SUCCESS`.

  Only a service that builds the linked repository is reused. One that builds another repository, or none, is left alone.
- **What the person does on the host:** the host's GitHub app must be allowed on the repository. The panel says so, and the host's own refusal is shown if it isn't.

**Fly.io runs Node's own image with the project's files:**
- **What's sent:** `registry-1.docker.io/library/node:22-slim`, the files in the machine's configuration (base64, under `/app`), `node /app/<entry>`, PORT 8080, a shared IPv4 and an IPv6 address.
- **What fits:** only apps with no dependencies and no build step, at most 200 files and 512 KB. The configuration's size limit isn't documented, so it stays well under any plausible one. The two starters fit; anything else is told to use Render or Railway, or a Dockerfile deploy, which isn't built.
- **Whose app it is:** each machine Farbaek makes carries the metadata `farbaek: launch`. Only those machines are replaced. An app in another organization, or one that runs machines Farbaek didn't make, is left alone.
- **The token:** Fly.io's organization tokens (`FlyV1 …`) have their own shape check, and the organization's slug is required.

**The commands (`servers.ts`):**
- **Install:** with install scripts off, as everywhere in Farbaek, and only when the app has dependencies.
- **Build:** the project's own build script.
- **Start:** `npm start`. Fly.io starts the `node <file>` its start script names.
- **Port:** apps get it as `PORT`.

**Shared with Vercel and Netlify, unchanged:**
- the evidence gate, the typed name, one key per launch, one running launch per project;
- sealed tokens, a connection checked with the host first, the outcome watch.

**Addresses on each host's own domain** (in TypeScript and in v92's checks):
- addresses: `*.onrender.com`, `*.up.railway.app`, `*.fly.dev`;
- dashboard links: `dashboard.render.com`, `railway.com`, `fly.io`.

## Consequences

- **The two starters launch from Farbaek:** the App with sign-in and the REST API starter now reach a real server host.
- **Data on the host is lost on redeploy:** none of the three keeps a disk across deploys unless the person attaches one there. The panel and the starter's README say so.
- **Cost:**
  - **Render:** the free instance sleeps when idle.
  - **Railway:** bills under its own plan.
  - **Fly.io:** has no free plan.
  - **Farbaek:** charges nothing and buys nothing for the person.
- **Not yet run against a real account**, as Netlify wasn't at first. The clients are tested with fakes recorded from the official references. A free Render account is the cheapest first real test.
- **Not confirmed in the docs:**
  - whether Render or Railway can deploy a public repository without their GitHub app;
  - the exact error Render gives for a repository it can't reach;
  - Fly's configuration size limit;
  - Railway's `serviceInstanceAutoDeployUpdate` and a service's `source { repo }`, which are in Railway's live schema but not its guides;
  - whether Railway starts a deploy when a repository is connected. If it does, that deploy builds the launch commit, with the variables and commands already set.
- **Dependencies the host installs aren't in the evidence:** the launch's files are exactly what was authorized, but Render and Railway install the packages they name. Install scripts are off.
