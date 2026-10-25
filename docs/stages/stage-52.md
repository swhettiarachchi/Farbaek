# Stage 52: Import public GitHub repositories

The spec's Stage 2 asks for project import from GitHub and from upload. Upload was built earlier; GitHub wasn't.

- **Decision record:** `docs/adr/0074-github-import.md`.
- **Branch:** `feat/github-import`, on top of `feat/first-steps` (stage 51), so one build checks both.

## 2026-10-25

### Done

- **`src/core/workspace/github.ts`:**
  - reads `owner/repo`, github.com addresses (with `/tree/<ref>`) and git remotes;
  - builds the archive request;
  - accepts GitHub's redirect only to codeload.github.com, for the same repository and ref, rebuilt from checked parts;
  - reads the commit from the archive's comment.
- **`src/server/workspace/github-import.ts`:**
  - downloads with a 60 MB cap, counted while streaming, and a 45-second limit;
  - unpacks and screens like a rescue import;
  - checks the import limits and names the one that's reached;
  - creates the project with the source and commit in its description, then stores the files.
- **Action:** `importGitHubAction`, 10 per person an hour.
- **Projects page:** an "Import from GitHub" card. The project page says how many files came in and offers a security check.
- **Wording:** Billing no longer says GitHub import isn't built.
- **Threat model:** a GitHub import section.

### Verified

- `src/core/workspace/github.test.ts` (9): pasted forms, refused hosts and pages, refused redirects (other host, port, repository, ref, shape, credentials), the commit from an archive.
- `src/server/workspace/github-import.test.ts` (7):
  - exactly two requests, the first not following redirects and the second refusing them;
  - `.env` screened out and `node_modules` left packed;
  - a branch's commit read from the archive;
  - not found, a redirect to another host, both size caps, slow, unreachable and busy.
- `tests/smoke/github.smoke.test.ts` against real GitHub (3 of 3, with `FARBAEK_SMOKE_GITHUB=1`): `octocat/Hello-World` at its exact commit, the `sindresorhus/slugify` tag v2.2.1 with its commit, and a missing repository.
- `pnpm typecheck`, lint and the design tests are clean.

### Next

Shadow mode (the Stage 3 gap).
- Demo build: the GitHub card at 1280 and 375 px with no sideways scroll; the demo shows the read-only reason. `pnpm qa:a11y` on `/app` and `/app/projects`: 4 page views, 0 findings.
