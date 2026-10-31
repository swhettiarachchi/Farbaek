# ADR 0147: Stacked pull requests

- Status: accepted (2026-10-31).
- Follows ADR 0126, under which Farbaek opens one pull request per applied change, on its own branch from the linked repository's default branch. The spec audit noted "no stacked pull requests".

## The problem

A file goes into a pull request only when GitHub still has the version the change started from. Then nothing on GitHub is overwritten.

That check fails in one common case. Suppose two changes in a row edit the same file, and the first one's pull request hasn't merged yet. The second change started from the first one's version, but the default branch still has the version from before. So the second pull request was refused: "merge any earlier pull request from Farbaek, then try again".

## Decision

**Stack it on the earlier pull request's branch.**
1. The check runs against the default branch first, exactly as before. If it passes, nothing changes.
2. If it fails, Farbaek tries the branches of its own earlier pull requests on the same repository:
   - pull requests that haven't been read back as merged or closed (ADR 0143), so open or not yet read;
   - newest first, at most three;
   - each one's own branch, read fresh from GitHub. A deleted branch is skipped.
3. The first branch that has every file at the version this change started from becomes the base:
   - the commit's parent and tree come from that branch's head;
   - the pull request's base is that branch;
   - the description starts with "**Stacked on #N**: … merge #N first", and how to move it to the default branch if GitHub doesn't.
4. If no branch passes, nothing is pushed. The error says the open pull requests don't have those versions either.

**The same guarantee as before:** a file is written only on top of the exact version the change started from, so nothing on GitHub is overwritten. Stacking changes which branch is checked, not the check.

**Recorded as it is.**
- The pull request's base branch is stored, as before (migration v77), and the task and project pages already show "into <base>".
- The person is told it's stacked, and on which pull request.
- No migration.

## Consequences

- People can open pull requests for a run of changes to the same files without waiting for each one to merge.
- When the earlier one merges, GitHub moves the stacked one to the default branch only if the merged branch is deleted, which is a repository setting. Otherwise the person changes the base on GitHub, as the description says. Farbaek's stored base branch isn't updated when that happens.

## Not done

- Updating the stored base branch when GitHub retargets a stacked pull request.
- Rebasing a stacked pull request after the one under it changes.
- Stacking on pull requests that someone else opened.
