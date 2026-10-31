# Stage 121: Importing a private GitHub repository

Owners and admins can now import a private repository with the workspace's own GitHub token, and link the new project to it so applied changes open pull requests there.

- **Decision record:** `docs/adr/0144-private-repository-import.md`.
- **Branch:** `feat/github-sync` (with stages 116 to 120, in one pull request).
- **Migration:** v86, `supabase/migrations/20261227090000_github_private_import.sql`.

## 2026-10-31

### Done

- **`src/core/workspace/github.ts`:**
  - `apiArchiveUrl`;
  - `apiArchiveFromRedirect`: codeload only, this repository and ref only, GitHub's download token as the only query parameter;
  - `safeRef`.
- **`src/server/workspace/github-import.ts`:**
  - `downloadWithToken`;
  - the public download first, then the token only when nothing was found and a token was passed;
  - messages for each refusal;
  - the shared capped fetch.
- **`importGitHubAction`:**
  - the token is opened only for owners and admins;
  - a hint for everyone else;
  - the import is recorded (v86);
  - the project is optionally linked with `app_link_github_repo`.
- **The import form:** says whether private repositories can be imported here and why not, with the link checkbox. The project page notes when it's linked.
- **Activity:** `project.github_imported`.

### Verified

- `src/core/workspace/github.test.ts` (4 new):
  - the API address;
  - the redirect keeps only GitHub's download token, and refuses other hosts, repositories, refs, extra parameters and fragments;
  - the ref check.
- `src/server/workspace/github-import.test.ts` (6 new):
  - the token is used only after the public download finds nothing;
  - the token goes to api.github.com alone, and codeload is fetched without it;
  - a named branch is asked for;
  - a redirect elsewhere is refused;
  - each refusal message never contains the token;
  - the hint without a token.
- `tests/db/github-private-import.test.ts` (5):
  - it needs a connection;
  - one audit event, and the token marked used;
  - owners and admins only;
  - another workspace's project and malformed names are refused;
  - it's server-only.
- `pnpm typecheck`, lint and full `pnpm test`.

### Not verified

- **Against a real private repository:** it needs a workspace with a token that has been given one. GitHub documents that a private archive's link carries a temporary token. If GitHub's link has a different shape, the import refuses it with "GitHub answered in a way Farbaek doesn't expect" rather than following it.

### Next

- Stacked pull requests, picking an element in a running app, tools and policies in the trust graph.
