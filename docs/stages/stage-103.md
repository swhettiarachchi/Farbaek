# Stage 103: GitHub pull requests and the ProofPack status

GitHub was import-only. The spec asks for a branch and pull-request workflow, and a "Farbaek ProofPack" status check that reflects the real result. This stage adds both.

- **Decision record:** `docs/adr/0126-github-pull-requests.md`.
- **Branch:** `feat/github-prs` (from `feat/own-keys`, PR #131).
- **Migration:** v77, `supabase/migrations/20261218090000_github_pull_requests.sql`.

## 2026-10-30

### Done

- **`src/core/github/pull-request.ts`:**
  - the fine-grained token rule and the prefilled token link;
  - repository names, and the repository an import came from;
  - branch names;
  - git blob ids;
  - which files a pull request may hold;
  - the status for each ProofPack state;
  - the pull request's body.
- **`src/server/github/client.ts`:** the GitHub calls, api.github.com only, with plain errors that never hold the token.
- **`src/server/github/pull-requests.ts`:** opening a pull request for one applied change, posting the status, and refreshing it after checks record a new ProofPack (wired in `src/server/sandbox/wiring.ts`).
- **`src/server/github/store.ts`:** member-safe readers, the sealed token, and the applied change rebuilt from its revisions.
- **Settings, GitHub:** status for everyone; owners and admins see the token steps, **Check and save** and **Disconnect GitHub**.
- **Project, GitHub page** (`/app/projects/[id]/github`, linked from the project header):
  - link or unlink a repository, prefilled from the import source;
  - the pull requests Farbaek opened, with their status.
- **Task, Pull request card** once a change is applied: **Open a pull request** or **Update the status check**, each unavailable with its reason.
- **Elsewhere:**
  - Activity names the new events;
  - Integrations shows GitHub connected and the linked projects;
  - the publish permission covers pull requests;
  - the Privacy Policy says what goes to GitHub.

### Verified

- `src/core/github/pull-request.test.ts` (12):
  - git's own blob ids for `""` and `"hello\n"`;
  - classic tokens refused;
  - the token link's permissions;
  - names and branches;
  - conflict planning;
  - the status mapping (140 characters or fewer, no em dashes);
  - a body that mentions nobody.
- `src/server/github/client.test.ts` (7), against a labelled fake fetch:
  - only api.github.com, with encoded paths and the API version;
  - base64 blobs and full refs;
  - every refusal mapped, never echoing the token;
  - pull request addresses only on github.com.
- `src/server/github/pull-requests.test.ts` (7), against a fake GitHub:
  - the full open flow, in order;
  - nothing pushed on a conflict or when the change is already there;
  - replaced, archived or no-push repositories refused;
  - an existing branch never reused;
  - a status failure reported but not fatal;
  - status updates.
- `tests/db/github.test.ts` (8):
  - owners and admins connect, link and unlink, audited without the token;
  - members, viewers and other workspaces are refused;
  - bad names, archived projects and plain tokens are refused;
  - one pull request per applied change;
  - publish withheld is refused;
  - only github.com pull request addresses;
  - members never read the sealed token, and only the server writes.
- `pnpm typecheck`, `pnpm lint`.

### Not verified

- A real pull request on a real repository needs a token that only the owner can create.
