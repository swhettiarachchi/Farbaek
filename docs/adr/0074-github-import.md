# ADR 0074: Import public GitHub repositories

- Status: accepted (2026-10-25).
- Spec Stage 2: "project create/import (GitHub and upload)". Upload was built as folder import and rescue import (ADR 0028).

## Context

Projects could be filled from a folder on the person's computer or from a .zip. Most people who already have code keep it on GitHub. A full GitHub connection, needed for private repositories and for pushing changes back, needs a GitHub App that the owner registers under their own account. That's an account step only the owner can take.

## Decision

**Public repositories now, with no connection.** Projects > Import from GitHub takes `owner/repo`, a github.com address (with `/tree/<branch or tag>`), or a git remote.

**Where the server may fetch** (`src/core/workspace/github.ts`):
- The pasted text is parsed by strict patterns into owner, repository and ref.
- The server requests only `https://github.com/<owner>/<repo>/archive/<ref or HEAD>.zip`, without following the redirect.
- It then follows the `codeload.github.com` address that the redirect names, but only if it's for the same repository and the same ref (or a full commit hash). The address is rebuilt from the checked parts. This request refuses any further redirect.

**Which commit.** For the default branch, GitHub's redirect names the commit. For branches and tags, GitHub writes the commit hash as the zip's comment, and the import reads it from there. The project's description records it: "Imported from github.com/owner/repo at 7fd1a60."

**Screening.** The archive is unpacked and screened exactly like a rescue import (`rescueFilesFromZip`): GitHub's top folder is dropped, and secrets, binaries and dependency or build folders are left out. The server's import screens every file again.

**Limits:**
- 60 MB per download, enforced both by the declared size and while streaming;
- 45 seconds;
- the import limits of 4 MB of text and 3,000 files;
- 10 imports per person an hour.

Every refusal says which limit was reached and what to do.

**Private repositories** say plainly that they can't be imported yet.

## Consequences

- No account, token or app is needed, and nothing is sent to GitHub about the person beyond the repository name, from the server's address.
- Unauthenticated archive downloads aren't counted against GitHub's API limit, but GitHub can still slow them down. When it does, people see "GitHub couldn't send this repository right now".
- A later GitHub App connection adds private repositories and pushing back. It replaces only the download step.
