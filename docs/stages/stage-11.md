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

**Production database:** migration v25 applied to the self-hosted database on 2026-10-22 (SHA-256 `677c305f…697a1be` matched on both ends; one transaction with `ON_ERROR_STOP`). Read-only checks afterwards: the table exists with RLS on and one policy (members read their workspace's Capsules), 0 rows; `app_record_capsule` runs for `service_role` only, not `anon` or `authenticated`; `anon` can't select and `authenticated` can't insert. The API's schema cache was reloaded.

### Next

- Phase B: nearby transfer between Farbaek Agents (discovery, pairing with a short code, an encrypted channel, chunked sending with per-chunk checks). It needs its own plan.

## 2026-10-22: phase B, nearby transfer between Farbaek Agents

- **Plan:** approved 2026-10-22.
- **Decision record:** `docs/adr/0038-mesh-nearby-transfer.md`.
- **Branch:** `feat/mesh-nearby`, from `feat/mesh-capsules`.

### Done

**Cryptography:** `Noise_XX_25519_AESGCM_SHA256` on `node:crypto` (`src/agent-runtime/mesh/noise.ts`), no new dependencies. Electron's BoringSSL has no ChaCha20-Poly1305 for Node, hence AES-GCM.

**Pairing:**
- a six-digit code from the handshake hash, confirmed by both people within two minutes;
- the device key kept with the system keychain;
- trusted devices stored by public key.

**Discovery:** UDP multicast only while visible or looking (five minutes); connect by address as the fallback.

**Transfer** (`farbaek-mesh/1`, `src/core/mesh/protocol.ts`):
- an offer of a Capsule manifest, with acceptance and a new destination folder;
- free-space check;
- streaming with backpressure;
- BLAKE3 per 4 MiB chunk and per file as it arrives;
- checkpoints and resume;
- cancel;
- `verified` only after every file matched.

**Shared code:** `checkManifest` and `ChunkHasher` are now shared in `src/core/mesh/capsule.ts`. The folder guard gained binary streaming (`openRead`, `createNew`, `moveNew`).

**The agent:** a **Nearby** view (visibility, pairing code, send a folder, incoming offers, transfers with progress, Resume and Cancel, paired computers with Forget), also reachable without pairing with Farbaek.

### Verified

- **Noise** matches the published cacophony vector for `Noise_XX_25519_AESGCM_SHA256`: all six messages and the handshake hash. Tampered, replayed and reordered messages are refused, and a relay gives different codes.
- **Two `MeshNode`s on localhost** (`mesh.test.ts`, 14 tests, stable over three runs):
  - pairing, and a "don't match" pairs nothing;
  - a 10 MiB binary and text files arrive byte-identical;
  - a second transfer lands in a new folder;
  - decline writes nothing;
  - a dropped connection resumes from the checked chunks and the result is identical;
  - a corrupted chunk stops the transfer and removes everything;
  - traversal in an offer is refused;
  - not enough space is refused;
  - a forgotten device is refused.
- **Two bugs found and fixed by those tests:**
  - resumed writes landed at the file's start;
  - a receiver's last error was lost by an abrupt close.
- **The same tests under Electron's own runtime** (`ELECTRON_RUN_AS_NODE`), on BoringSSL: 30 of 30 pass.
- **Live in the real app:** two agent windows on this computer with scratch data folders, driven over DevTools.
  - Window A found B by multicast.
  - Both showed code 335 201, and both confirmed.
  - A sent `harbour-lane` (3 files, 12.0 MB), and B accepted.
  - Both showed "Checked".
  - The SHA-256 of every received file matched the original; `.env` and `node_modules` stayed behind; no temporary folder was left.

### Not yet

- **Between two physical computers on a real network:** needs the owner. Install the rebuilt agent on two computers on the same Wi-Fi.
- **The installer:** it needs rebuilding (`pnpm agent:dist`) to include Nearby.
- **Not built:** mDNS for iOS, the mobile apps (Stage 7), remote transfer and the encrypted relay.
