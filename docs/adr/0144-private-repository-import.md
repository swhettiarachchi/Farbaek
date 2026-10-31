# ADR 0144: Importing a private GitHub repository

- Status: accepted (2026-10-31).
- Follows ADR 0074 (public repository import) and ADR 0126 (the workspace's fine-grained GitHub token). The spec audit noted "No private-repository import".

## Decision

**The workspace's own token, nothing new to connect.**
- A private repository is read with the token an owner or admin already connected in Settings (ADR 0126).
- No GitHub App and no OAuth: the token's Repository access on GitHub decides what Farbaek can read. It needs Contents: Read for the repository; linking it for pull requests needs the write access ADR 0126 already lists.

**Only when needed, only by owners and admins.**
- The import tries the public download first, with no credentials, exactly as before.
- Only when GitHub finds nothing there, and the person is an owner or admin of a workspace with GitHub connected, is the repository read with the token.
- Members can still import public repositories. When theirs isn't found, the error says an owner or admin can import a private one.

**Where the token goes.**
1. `GET https://api.github.com/repos/{owner}/{repo}` reads the repository's real names, its default branch and whether the token can push. The token goes in the Authorization header.
2. `GET https://api.github.com/repos/{owner}/{repo}/zipball/{ref}`, again with the token, is answered with a redirect.
3. The redirect is rebuilt from checked parts (`apiArchiveFromRedirect`):
   - only `https://codeload.github.com`;
   - only this repository and the asked-for ref, or a commit;
   - at most one query parameter, `token`: GitHub's own short-lived download token for a private archive.
4. The archive is fetched from that link without the workspace's token, under the same 60 MB cap and 45-second limit, and screened like any import.

Error messages never contain either token. A refusal says what to fix: the token was rejected, can't read contents, hasn't been given the repository, or has reached its rate limit.

**Recorded once, by the server** (migration v86, `app_record_github_import`):
- owners and admins only, for a project in the same workspace, with the repository's name and the commit in the expected shape;
- one `project.github_imported` audit event (repository, commit, "workspace token"), shown in Activity;
- the token's "last used" time, like opening a pull request.

The files are stored before this is recorded, because the project's id doesn't exist until then. If recording fails, the server logs an error rather than undoing the import.

**Linked in the same step, if asked.**
- The form offers "link the project to it so applied changes open pull requests there", on by default.
- It links only when GitHub says the token can push and the repository isn't archived. This is the same function and checks as linking by hand.

## Consequences

- Owners and admins bring an existing private codebase into Farbaek in one step, and changes go back to it as pull requests.
- Anyone the workspace makes an owner or admin can read every repository the token reaches. That was already true of linking; Activity now shows each import.

## Not done

- **Choosing from a list of the token's repositories:** the person pastes the name, as for public ones.
- **Other hosts** (GitLab, Bitbucket, GitHub Enterprise Server).
- **Keeping an imported project in step with later commits:** each import is a new project at one commit.
