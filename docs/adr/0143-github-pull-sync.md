# ADR 0143: What happened to a pull request on GitHub

- Status: accepted (2026-10-31).
- Follows ADR 0126, in which Farbaek opens a pull request for an applied change. The spec audit noted "nothing back from GitHub after a pull request opens".

## Decision

**Read, never written.**
- For each pull request Farbaek opened, the server reads two things with the workspace's own fine-grained token:
  - the pull request (`GET /repos/{owner}/{repo}/pulls/{n}`): open, merged or closed, when it merged, and the commit at its head;
  - the check runs GitHub has on that head (`GET /repos/{owner}/{repo}/commits/{sha}/check-runs`).
- Nothing is written to GitHub by this.

**When:**
- **Hourly:** on the existing hourly job, for pull requests still open or never read, opened in the last 30 days. Each is read at most every 30 minutes, oldest read first, with one token per workspace.
- **On request:** **Check GitHub now** on the task page, for contributors, at most every 20 seconds per pull request because the token's rate limit is shared.

**Recorded once, by the server** (migration v85):
- `app_sync_github_pull` keeps the state, the merge time, the head commit, a checks summary (passed, failed, still running, skipped, and up to 30 runs by name) and the time it was read.
- It refuses a state that doesn't add up, such as merged without a time.
- Becoming merged or closed writes `github.pull_merged` or `github.pull_closed` to the audit log once.

**Only what was read:**
- A check counts as passed only when it finished with success. Anything not finished is "still running".
- When the token can't read checks, which needs Checks read access, the state is still recorded and the page says what access is missing.
- When the pull request can't be read at all (token refused, deleted, rate limit, GitHub down), the reason is kept, beside whatever was read before.
- **On the page:** the task page and the project's GitHub page show "On GitHub" with the state in words and an icon, when it was read, and each check's result. Merged pull requests note when commits were added on GitHub after Farbaek's.

## Consequences

- People see in Farbaek whether their change landed, and what GitHub's own checks said, without opening GitHub.
- This uses a little of the workspace token's hourly rate limit: at most two calls per open pull request every 30 minutes.

## Not done

- **Webhooks from GitHub:** they need a public endpoint and a secret per repository. Reading on a schedule needs neither.
- **Review comments.**
