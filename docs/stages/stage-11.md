# Stage 11: Mesh, phase A (Workspace Capsules)

The owner asked to keep building the platform. The next unbuilt stage in the spec is Mesh (§11, Stage 5): local-first work across devices. It rests on the Workspace Capsule, so Capsules come first; nearby transfer between computers is phase B.

- **Plan:** approved 2026-10-22.
- **Decision record:** `docs/adr/0037-workspace-capsules.md`.
- **Branch:** `feat/mesh-capsules`, from `feat/vps-database` (what runs in production).

## 2026-10-22

### Done

**The format** (`src/core/mesh/capsule.ts`, pure):
- `farbaek.capsule/1`: a zip with `capsule.json` and `files/`;
- BLAKE3 (`@noble/hashes` 2.4.0) for every file and every 4 MiB chunk, and a digest of the RFC 8785 canonical manifest;
- packing leaves out credentials, secret-looking content, dependency and build folders, binaries and oversized files, each listed with its reason;
- opening fails closed: zip caps, a zod manifest, every path checked (traversal, absolute, NFC, case collisions), exactly the listed entries, every byte and chunk hashed again, text only, screened again;
- `planImport` and `filesToWrite`: new, unchanged or differing; differing files default to keep mine, with use the Capsule's and keep both (`name.capsule.ext`).

**The database** (migration v25, `supabase/migrations/20261027090000_workspace_capsules.sql`):
- `workspace_capsules`, read by members under RLS;
- `app_record_capsule`, service role only: membership, the role for imports, the project in the workspace, a rate limit, and a `capsule.exported` or `capsule.imported` audit event.

**The server** (`src/server/mesh/capsules.ts`): packing a project, importing with the person's choices through `createProject` and `importProjectFiles` in batches under the import limit, recording, and history.

**The app:**
- `GET /app/projects/<id>/capsule` downloads `<project>.capsule.zip`, read under RLS, with its digest in `x-capsule-digest`.
- **Mesh** in the sidebar (`/app/mesh`), replacing the locked "Mesh devices" entry:
  - **Send a Capsule:** choose a project, see its files, size and what stays behind, then download;
  - **Open a Capsule:** every byte checked in the browser; a verification report with the Seal drawn from the Capsule's digest; a new project or an existing one; per differing file a choice and a comparison with your version; the server checks it all again before writing;
  - **Your devices:** nearby transfer is visibly unavailable, with the reason;
  - **History:** each recorded export and import with its digest.
- The demo workspace can pack and check Capsules but not import them, and says so.

**Docs:** ADR 0037, the threat model's Capsule section, `current-state.md`.

### Verified

- `pnpm typecheck` and `pnpm lint` on the changed files: clean.
- `src/core/mesh/capsule.test.ts` (13 tests) and `tests/db/capsules.test.ts` (5 tests) pass, with the design and component tests (107 in all).
- A production build in demo mode (`NEXT_PUBLIC_SUPABASE_URL=off`), checked in the browser at 1280px and 375px:
  - Send: Storefront previews as 7 files, 3 KB, nothing left out; the download is `storefront.capsule.zip` with `no-store`, and its `x-capsule-digest` matches the digest the browser computes when opening it;
  - Open into the same project: 7 unchanged, Import 0 files;
  - a Capsule with `README.md` edited (hashes recomputed): 6 unchanged, 1 differs, defaulting to Keep mine; Keep both makes it Import 1 file; Compare shows the added lines;
  - a Capsule with one letter changed in `src/lib/cart.ts` and its CRC fixed: refused by name ("its BLAKE3 hash doesn't match"), with no Seal and no import form;
  - the demo can't import and says why; the phone tab bar keeps five slots, with Mesh under More;
  - no horizontal scroll at 375px. A 4px overflow of the per-file switch (a fieldset's default minimum width) was found and fixed.

### Next

- Phase B: nearby transfer between Farbaek Agents (discovery, pairing with a short code, an encrypted channel, chunked sending with per-chunk checks). It needs its own plan.
