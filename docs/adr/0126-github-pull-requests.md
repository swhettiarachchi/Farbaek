# ADR 0126: GitHub pull requests and the ProofPack status

- Status: accepted (2026-10-30).
- From master spec "Git: status and diffs; GitHub repository, branch and PR workflow once implemented", §25 Portable Proof ("a GitHub status check ("Farbaek ProofPack: verified")… the status check reflects the real result"), and the Intent Lock line "Enforce… in Git/CI gates (a GitHub status check)". The spec audit of 2026-10-30 listed both as not built; GitHub was import-only (ADR 0074).

## Decision

**A workspace connects its own fine-grained GitHub token. There's no Farbaek GitHub App.**
- **Nothing to register:** no platform secret, and it works the day it ships.
- **No confused deputy:** Farbaek can only write where that person's token can, and only to the repositories they gave it. With a shared App, Farbaek would have to prove, for every workspace, that the person may push to the repository they name.
- **Fine-grained tokens only:**
  - They start with `github_pat_`.
  - Classic tokens (`ghp_` and the like) are refused, because they reach every repository the person can.
  - Settings links to GitHub's token form, filled in by URL parameters (GitHub's documentation, checked 2026-10-30): name Farbaek, 90 days, Contents, Pull requests and Commit statuses set to read and write. The person still chooses the repositories.

**Connecting (Settings, GitHub). Owners and admins only:**
- `GET /user` says whose token it is.
- The token is sealed with the provider-token vault (AES-256-GCM, ADR 0078), bound to the workspace and `github`.
- It's stored with the login, its last four characters, and the expiry GitHub reports.
- Members see who connected it, never the token.

**Linking a project (the project's GitHub page). Owners and admins only:**
- `GET /repos/{owner}/{repo}` with the token must show push access, a repository that isn't archived, and a default branch.
- The names stored are GitHub's own, with the repository's id. A repository deleted and created again under the same name is refused until it's linked again.

**Opening a pull request (the task's Pull request card).** Contributors who may publish, for an applied change only:
1. **The files come from the database, not the browser:**
   - each one as the change left it: the revisions the change wrote;
   - the version it started from: its base revision, or nothing for a new file.
2. **For each file, GitHub's blob id on the base branch is compared** with git's id (SHA-1 of `blob <len>\0` plus the content) for the "before" version:
   - **GitHub still has "before"** (or nothing, for a new file): the file goes in.
   - **GitHub already has "after"** for every file: there's nothing to open.
   - **Anything else:** nothing is pushed, and the files are named. **Nothing on GitHub is ever overwritten.**
3. **Blobs, a tree on the base tree, and a commit whose parent is the base head**, on a new branch `farbaek/<task-slug>-<change-id>`:
   - a branch that already exists is never reused;
   - the commit names the task, the change and the contract hash.
4. **The pull request's body:**
   - the plan summary and files;
   - the contract version and hash, and the ProofPack digest;
   - "Opened by Farbaek for {workspace} with {login}'s token. Review before merging."

   It mentions nobody.
5. **A commit status with context `Farbaek ProofPack`**, linking to the task. Only a verified ProofPack passes:

   | Latest ProofPack for the change | Status |
   | --- | --- |
   | Verified | success |
   | Failed | failure |
   | Partly verified | failure (a required check never ran) |
   | Unverified, or none | pending |

6. **It's recorded through `app_record_github_pull_request`:**
   - one per change;
   - contributors with the publish permission, checked again by a trigger on the row;
   - audited without the token.

**Keeping the status true:**
- When checks record a new ProofPack in the sandbox, the server posts the new result on the same commit and records it. This is best effort: it's logged on failure and never stops the verification.
- **Update the status check** on the task does the same on demand.

**Calls:**
- only to `https://api.github.com`;
- path segments built from checked names and encoded;
- the `2022-11-28` API version;
- 15 seconds per call, no redirects followed;
- errors become plain messages that never contain the token.

**Storage (migration v77):**
- `workspace_github` (sealed token; members can't select it);
- `project_github_repos`;
- `github_pull_requests` (its url is checked as a github.com pull request);
- six `app_*` functions for `service_role` only;
- audit events `workspace.github_connected` and `workspace.github_disconnected`, `project.github_linked` and `project.github_unlinked`, `task.pull_request_opened`.

## Consequences

- An applied change can leave Farbaek as an ordinary pull request that people review on GitHub, with its evidence beside it. A repository's rules can require the "Farbaek ProofPack" status before merging.
- Pull requests are authored as the person whose token it is, and anyone in the workspace who may publish can open them. Settings says so.
- The status sits on Farbaek's own commit. Commits pushed to the branch afterwards don't carry it, so a rule that requires it asks for a fresh change from Farbaek.
- The publish permission now also covers opening pull requests (ADR 0087's wording updated).

## Not done

- **A Farbaek GitHub App,** which would give check runs with richer output and a bot author.
- **Importing private repositories** with the token.
- **Stacked pull requests:** a change built on another unmerged one waits until that one merges, because GitHub doesn't yet have the version it started from.
- **Webhooks:** Farbaek doesn't hear back from GitHub, so a pull request's merge or close isn't tracked.
