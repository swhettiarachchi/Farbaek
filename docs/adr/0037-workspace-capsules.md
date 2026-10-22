# ADR 0037: Workspace Capsules, the first part of Mesh

- Status: accepted (2026-10-22).
- Spec: §11 (Farbaek Mesh), Stage 5. Phase A of two.

## Context

Mesh is local-first work across devices. The spec builds it on one thing: the **Workspace Capsule**, a project packed to travel, with a hash for every file, secrets left out, strict checks on arrival and nothing ever executed.

Nearby transfer between computers (discovery on the local network, pairing with a short code, an encrypted channel between two Farbaek Agents) needs new crypto dependencies and testing on real devices. It is phase B. Capsules are useful on their own, and phase B sends the same Capsule, so they come first.

## Decision

### The format: `farbaek.capsule/1`

A Capsule is a zip, written with the existing `zipFiles` and read with the existing `readZip`:
- `capsule.json`: the manifest;
- `files/<path>`: each file's bytes, as stored.

The manifest records the format, a random id, when it was packed, the source project's id and name, an optional note, the files, what was left out and why, and the totals. For each file it records the path, the size, a **BLAKE3** hash of the whole file, and a BLAKE3 hash for every **4 MiB chunk**. Chunk hashes let phase B resume and check a transfer piece by piece.

A Capsule's identity, its **digest**, is BLAKE3 of the manifest in RFC 8785 canonical JSON (`src/core/trust/canonical-json.ts`). Two Capsules with the same files and metadata have the same digest, whatever order the JSON was written in.

**BLAKE3** comes from `@noble/hashes` 2.4.0: audited, zero dependencies, no install scripts, pure JavaScript, so the same code runs in the browser, on the server and in the desktop agent. ProofPacks keep SHA-256, which their in-toto format names.

### What stays behind

Packing runs every file through the import screen in `src/core/workspace/files.ts` (`screenFile`): `.env` files, keys and credentials, dependency and build folders, binary files, oversized files and content that looks like a secret are left out. Each one is listed in the manifest with its reason, and the person sees the list before downloading. The interface says plainly that detection is pattern-based and not guaranteed.

### Opening: untrusted until proven otherwise

`openCapsule` in `src/core/mesh/capsule.ts` fails closed. Any problem rejects the whole Capsule, described in words:
- `readZip`'s caps: the number of entries, each file's size and the total counted as it inflates (so a zip bomb stops early), every offset bounds-checked, each CRC-32 checked, and encrypted or ZIP64 archives refused. Entries are only ever read as bytes and stored as text in the database, so a symlink in the archive has nothing to point at;
- the manifest parsed with zod;
- every path checked like any import (`checkPath`): no traversal, no absolute paths, NFC form only, unique even ignoring case, and allowed by `screenPath`;
- the archive holds exactly the manifest and the files it lists, nothing more;
- every byte hashed again, whole file and each chunk;
- every file is UTF-8 text and passes `screenFile` again;
- the totals match, and stay within `CAPSULE_LIMITS` (`src/config/workspace.ts`): 3,000 files, 512 KB each, 5 MB in all.

Nothing in a Capsule runs, installs or builds. Its files are stored as text revisions, like any import.

The browser runs the same checks first, so a damaged or altered Capsule is caught before anything is sent. That preview is advisory. The server action opens the uploaded Capsule again and its result is the decision. Writes then go through `createProject` and `importProjectFiles`, which screen every file a third time and keep the database's own limits.

### Conflicts: nothing is overwritten silently

Into an existing project, `planImport` compares BLAKE3 hashes:
- **new** files are added;
- **unchanged** files are left alone;
- **differing** files default to **keep mine**. The person can switch each one, or all of them, to **use the Capsule's** (a new revision; the old one stays restorable) or **keep both** (the Capsule's copy is saved as `name.capsule.ext`).

Each differing file can be compared with the project's version before choosing.

### The record: `workspace_capsules` (migration v25)

Each download and each import is recorded: direction, digest, project, counts, who and when. Members read their workspace's rows through RLS. Rows are written only by `app_record_capsule`, a service-role function that checks membership (any member can export, owners, admins and members can import), that the project belongs to the workspace, and a rate limit, and writes a `capsule.exported` or `capsule.imported` audit event. A record that fails never undoes a transfer; the person is told.

### Where it lives

- `src/core/mesh/capsule.ts`: the format, packing, opening and planning. Pure, shared by browser, server and, in phase B, the agent.
- `src/server/mesh/capsules.ts`: packing a project, importing with choices, recording, history.
- `src/app/app/projects/[projectId]/capsule/route.ts`: the download.
- `src/app/app/mesh/`: the Mesh page and its server actions.
- `src/components/mesh/`: Send and Open.

## Consequences

- People can move a project between workspaces, accounts and computers today, by any route they trust, and know on arrival whether a single byte changed.
- The 5 MB limit fits within one server action upload (`next.config.ts` allows 6 MB). Larger Capsules wait for phase B, which streams chunks between agents instead of uploading.
- A Capsule proves integrity, not authorship: anyone can pack one. Phase B adds pairing, so a device knows who it's talking to. Until then the page says where a Capsule came from only as the Capsule itself states it.
- **Phase B** (its own plan): the Farbaek Agent finds other agents on the local network, pairs with a short code (a PAKE), opens an encrypted channel, and sends a Capsule chunk by chunk, checking each chunk's BLAKE3 as it arrives. The "Your devices" panel on the Mesh page says this is coming and is visibly unavailable until then.
