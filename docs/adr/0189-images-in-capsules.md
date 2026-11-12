# ADR 0189: Images in Capsules

- **Status:** accepted
- **Date:** 2026-11-12
- **Stage:** 179
- **Amends:** ADR 0037 (Workspace Capsules) and ADR 0108 (images in projects).

## Context

Projects hold images since ADR 0108. Capsules still packed text only: a project's images were left behind without being listed, and opening a Capsule refused anything that wasn't UTF-8. Moving a site from one workspace to another lost its photos. Mesh between computers already carried any file, through the same manifest.

## Decision

**The format doesn't change.** `farbaek.capsule/1`'s manifest never said text: each file is a path, a size, a BLAKE3 hash and its chunks. The manifest is also the Mesh offer, so no field is added, and every Capsule made before this opens as it did.

**Packing:**
- A project's images travel as their bytes, beside its text.
- An image goes in only when its bytes are the kind its name says (`checkImage`: PNG, JPEG, GIF, WebP, AVIF or icon, up to 2 MB).
- Anything else that isn't text is left out and listed with its reason, as before. An `.exe` named `.png` is left out as "not a text file or an image".

**Opening, wherever it happens** (the browser's preview, the server's decision, `/verify`):
- Every byte is hashed again, whole file and chunk, as before.
- A file at an image path is let in only when `checkImage` passes, so a hostile sender can't slip other bytes under an image name even with matching hashes.
- Text keeps strict UTF-8 and the same screening.

**Importing:**
- **Writing:** text goes through `importProjectFiles` as before. Each image goes through `saveProjectImage`, the upload's own path, which checks the bytes again and saves over the revision it replaces (or 0 for a new path).
- **Comparing:** images compare by the BLAKE3 hash of their bytes, so an unchanged image is left alone. Keep both gives `name.capsule.png`. The compare view shows the two pictures side by side.

**Size:**
- **The new limit:** 9 MB per Capsule opened on the web, up from 5 MB, with images up to 2 MB each.
- **Why 9 MB:** the upload moved from a server action (6 MB body limit for every action) to `POST /app/mesh/import`, a route of its own with a same-origin check and a size check before the body is read. Next's proxy buffers request bodies up to 10 MB, so the limit sits below that rather than raising the proxy's limit for every request.
- **Larger Capsules** travel with nearby transfer, which has always carried images.

## Consequences

- **A site moves with its photos** between workspaces.
- **What still isn't carried:** fonts, videos and other binaries, because projects don't hold them either (ADR 0108).
- **Capsules from a newer Farbaek** with images open in an older one only if their images pass that version's checks. Older versions refused non-text, so those Capsules are refused there, as before.
