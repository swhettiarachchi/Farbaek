# Stage 124: Stacked pull requests

A change that builds on an earlier change whose pull request hasn't merged yet can now get its own pull request, stacked on the earlier one's branch, instead of being refused.

- **Decision record:** `docs/adr/0147-stacked-pull-requests.md`.
- **Branch:** `feat/stacked-pulls` (from `feat/trust-tools`).
- **Migration:** none.

## 2026-10-31

### Done

- **`src/server/github/pull-requests.ts`:**
  - the default branch is checked first;
  - if the check fails, Farbaek's own possibly open pull requests on the repository are tried (newest first, at most three);
  - the commit and pull request are based on the first branch with the right versions;
  - `stackedOn` is returned;
  - the error says when no open branch had them either.
- **`pullRequestBody`:** "Stacked on #N", with what to merge first.
- **`openPullRequestAction`:** passes the project's pull requests on that repository that aren't merged or closed, and says when the new one is stacked.

### Verified

- `src/server/github/pull-requests.test.ts` (3 new):
  - it stacks on the first open branch with the right versions, skipping a deleted one, with the tree, parent, base and description;
  - it stays on the default branch when that works;
  - it pushes nothing when no branch has the versions, and says so.
- The existing tests are unchanged, apart from the new `stackedOn` field.
- `pnpm typecheck`, lint and full `pnpm test`.

### Not verified

- **Against a real repository:** it needs two applied changes to the same file in a linked project, with the first pull request still open.

### Next

- Picking an element in a running app, and MCP servers as a tool source.
