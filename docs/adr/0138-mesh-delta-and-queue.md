# ADR 0138: Mesh sends only what changed, and waits for an offline device

- Status: accepted (2026-10-30).
- From master spec §11: transfers carry "a manifest with BLAKE3 hashes per file and chunk", "Preserve originals unless the user explicitly asks for a safe move", and "Offline receiver: explain that immediate delivery is impossible and offer a local queue."

## Decision

### Sending only what changed

The receiver chooses **Update an earlier copy** and picks a folder that holds an earlier copy of what's arriving.

**What's reused:**
- For each file in the offer, the receiver reads the same path in the earlier copy and hashes it in 4 MiB chunks with BLAKE3.
- A file whose chunks and whole-file hash all match is copied from the earlier copy into the incoming folder, and counts as complete.
- A file whose leading chunks match has those chunks copied, and the transfer carries on after them.

**No protocol change.** The receiver already answers an offer with resume points (ADR 0038): for each file, the chunks it holds, checked. A fully held file is reported with all its chunks, and the sender already skips those. So `farbaek-mesh/1` is unchanged, and older senders benefit too.

**The same guarantees:**
- The new copy goes into a new folder beside the earlier one. The earlier copy is only read, through the same folder guard that refuses links and paths outside it.
- Every reused byte is checked against the sender's hashes, and every file is checked whole before anything moves into place.
- If the earlier copy can't be read, every file is sent, and the transfer says why.
- The transfer shows how much was copied locally instead of sent.

**Why not a shared baseline on the sender.** A sender-side baseline would need the sender to know what the receiver still holds. The receiver is the only one that can check that, so it's the receiver that offers it.

### Waiting for an offline device

When a send can't reach its device, the sender chooses **Send when it's back**.

**Nearby.** The app listens for the device's announcements, and sends as soon as it's visible on the network again. Without discovery, it tries the last address.

**Over the internet.** It tries again every minute.

**Limits:**
- It waits only while the app is open, and for up to a day.
- **Try now** and **Stop waiting** are always there.
- The waiting transfer shows the time it waits until, under a "Waiting for it" badge.

**Across restarts:**
- The queue is saved in the app's data folder (`mesh-queue.json`): the folder, the device, the route and the last address. It is restored at start.
- Each folder is packed again from disk then, so what's sent is what's there now, with the same exclusions.
- Entries for forgotten devices, missing folders or expired waits are dropped.

**Nothing is uploaded while it waits.** The relay still carries only live, end-to-end encrypted sessions (ADR 0094). Waiting never stores files with Farbaek.

## Consequences

- Sending a project again after small changes moves only the changed files, and only the changed tail of a large file that grew.
- **Inserted bytes:** a change in the middle of a large file resends that file from the changed chunk on. Matching is by prefix, the shape the resume points already have.

## Not done

- **Reusing chunks after the first difference in a file:** that would need a new message in the protocol.
- **A queue on the receiving side:** a phone or browser that's offline can't receive, and the spec's queue is the sender's.
