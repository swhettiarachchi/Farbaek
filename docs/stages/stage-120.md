# Stage 120: What happened to a pull request on GitHub

After Farbaek opens a pull request, it now reads it back: whether it's still open, merged or closed, and what GitHub's own checks said. This runs hourly and when someone asks, and shows on the task and the project's GitHub page.

- **Decision record:** `docs/adr/0143-github-pull-sync.md`.
- **Branch:** `feat/github-sync` (from `feat/loom-3d`).
- **Migration:** v85, `supabase/migrations/20261226090000_github_pull_sync.sql`.

## 2026-10-31

### Done

- **Migration v85:**
  - columns on `github_pull_requests`: state, merge time, head, checks, time read and problem;
  - the server-only `app_sync_github_pull`, with validation and one audit event per merge or close.
- **`src/core/github/pull-request.ts`:** `checkResult`, `summarizeChecks` and `pullStateFrom`.
- **`src/server/github/client.ts`:** `pull` and `checkRuns`.
- **`src/server/github/pull-sync.ts`:**
  - one pull request at a time, or the due ones with one token per workspace;
  - the store;
  - wired into the hourly job.
- **The task page:** `readPullFromGitHubAction` (contributors, at most every 20 seconds) and **Check GitHub now**. The status button shows only while the pull request is open.
- **`PullOnGitHub`:** on the task card and on each pull request on the project's GitHub page.
- **Activity:** the merged and closed verbs.

### Verified

- `src/server/github/pull-sync.test.ts` (4):
  - only success passes, and merged wins over closed;
  - the state and the checks on the head are recorded;
  - the state is recorded without checks when the token can't read them;
  - the reason is recorded when the pull request can't be read;
  - each workspace's token is opened once, and a missing one is reported.
- `src/server/github/client.test.ts` (1 new): the two reads, only GETs, the exact paths and the parsing.
- `tests/db/github-pull-sync.test.ts` (4):
  - state and checks are recorded;
  - the merge is audited once;
  - inconsistent states and malformed checks are refused;
  - a problem leaves what was read before;
  - the function is server-only, and members read.
- `src/components/github/pull-on-github.test.ts` (3).
- `pnpm typecheck`, lint, full `pnpm test`.

### Not verified

- **Against a real repository:** it needs a workspace with GitHub connected and a pull request Farbaek opened. The first hourly run after the merge reads them.
