# 0010. Project files as revisions in Postgres

- Status: accepted
- Date: 2026-10-15

## Context

Studio needs a project's source files in Farbaek: to browse and search them, to give the AI relevant context, and later to generate patches, review diffs, take checkpoints and run tests in a sandbox. Spec section 6 asks for version history and supported undo, and every change must be reviewable.

## Decision

- **Storage:** Postgres (Supabase), not object storage. `project_file_revisions` holds every version of every file, immutably: `import`, `edit` or `delete`. `project_files` points each path at its current revision. History is never rewritten; checkpoints and diffs will reference revisions.
- **Text only:** UTF-8 text files. The database computes each SHA-256 and size itself. Binary assets are out of scope until previews need them (a later ADR, likely object storage).
- **Limits** (`src/config/workspace.ts`, re-checked by the database): 512 KB per file, 4 MB per import, 25 MB and 3,000 files per project. These protect the database and are not plan limits. The server action body limit is 6 MB to allow for encoding.
- **Paths:** relative POSIX paths with no `.` or `..` segments, no empty segments, no backslashes or control characters (`checkPath`, and `private.valid_project_path` in SQL, with a parity test). That keeps files inside the project root when a sandbox writes them out.
- **Import screening:** the browser reads and screens the files to show a preview, and the server screens them again before the database call. Dependency, VCS and build folders, credentials files (`.env*` except examples, private keys, `.npmrc`) and content that matches known credential formats are skipped, with the reason shown. Saving a file runs the same secret check.
- **Writes:** service-role-only `app_import_files` (all or nothing), `app_save_file` and `app_delete_file`, with a lock on the project row and optimistic concurrency on each file's revision. Reads go through Row Level Security (`get_project_file`, `search_project_files`, which run as the caller).
- **Search:** case-insensitive plain-text search in SQL, returning at most 200 matching lines. No index yet. Add a trigram index if search gets slow.

## Consequences

- Revisions store full contents, so storage grows with every edit. Fine at these limits. Delta storage or pruning old revisions needs its own decision, because history is evidence.
- The file view is a lightweight read-only renderer. Editing and diff review use CodeMirror 6 (ADR 0002) once it's installed.
- Larger projects or binary assets need object storage and a migration path.
