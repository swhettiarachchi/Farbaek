# ADR 0108: Images in projects

- Status: accepted (2026-10-29).
- First half of image generation: generation (ADR 0109) saves through this.

## Context

Project files are text. Imports skip binary files, and the static preview says "image files by path don't show here yet". A site built in Farbaek can't hold its own photo or logo, and generated images would have nowhere to go.

About 60 places read a project's file contents: the agent and its AI context, security checks, search, sandboxes, previews, publishing, export, Capsules and launches. Most of them should never see image bytes. The agent, for example, would spend AI usage reading base64.

## Decision

**Images are project files with an encoding.**
- A file revision stores base64 in its `content`, with `encoding = 'base64'`.
- Its `sha256` and `size_bytes` are over the decoded bytes, computed by the database.
- Versions, publishing, deployment digests, undo and proofs keep working unchanged, because they work from paths, revisions and hashes.

**Only image paths, only real images:**
- `.png`, `.jpg` or `.jpeg`, `.gif`, `.webp`, `.avif` and `.ico`;
- each 2 MB at most, with the project's own limits still applying;
- the server checks the bytes' signature matches the extension, so a renamed file is refused.

SVG stays a text file.

**One write path for each kind, enforced by the database:**
- the text write (`put_project_file`) refuses image paths, so an agent change, a text import or an edit can never overwrite an image with text;
- the image write (`app_save_binary_file`) refuses anything but image paths.

**Invisible by default:**
- the bulk reader (`getProjectContents`) returns text files only, so the agent, security checks, search, sandboxes and AI context are unchanged;
- the places where images belong ask for them: the file page shows and replaces them, the static preview inlines them by path, the published site serves them with their content type, and the export zip includes them.

## Not yet

- **Capsules and Mesh** carry text files only. Their format has a text manifest, and changing it is its own decision.
- **Sandboxes** (app previews and checks) get text files only, so images are missing there until those uploads send bytes.
- **Launches to Vercel and Netlify** send images as bytes since 2026-10-29 (stage 86). The Launch page's fingerprint and the authorized launch come from one list (`server/launch/files.ts`).
- **The agent can't read images.** It sees their paths in the file list.

## Consequences

- Existing projects are unchanged: every current file is text and keeps `utf8`.
- A project with images publishes them on farbaek.si as they are.
