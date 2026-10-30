# Stage 115: Mesh sends only what changed, and waits for an offline device

A receiver can point an incoming transfer at an earlier copy on the same computer: matching files and leading chunks are copied locally, and only the rest is sent. A sender whose device is offline can choose Send when it's back. The transfer then goes as soon as the device returns, for up to a day, across restarts.

- **Decision record:** `docs/adr/0138-mesh-delta-and-queue.md`.
- **Branch:** `feat/mesh-delta` (from `feat/static-scan`).
- **Migration:** none.

## 2026-10-30

### Done

- **`src/agent-runtime/mesh/receive.ts`:**
  - `accept(parent, earlier?)` seeds the incoming files from the earlier copy by BLAKE3 chunk hashes, through the folder guard;
  - files that match whole count as complete, and leading chunks become resume points;
  - the view shows the bytes reused;
  - if the earlier copy can't be read, everything is sent, and the transfer says why.
- **`src/agent-runtime/mesh/node.ts`:**
  - `queue`, `unqueue` and `retryQueued`;
  - nearby sends go when discovery sees the device again; internet sends retry every minute;
  - a day's limit;
  - the queue is saved in `mesh-queue.json` and restored at start, with each folder packed again from disk;
  - one `outgoingFor` builds nearby and internet transfers.
- **The desktop app:**
  - **Update an earlier copy** on an incoming offer (one folder dialog; the new copy is saved beside the earlier one);
  - **Send when it's back**, **Try now** and **Stop waiting**;
  - a "Waiting for it" badge with the time;
  - the bytes copied locally;
  - IPC handlers and preload.

### Verified

- `src/agent-runtime/mesh/mesh.test.ts` (3 new), over real sockets and the fake relay:
  - the second send of a changed folder moves exactly the changed bytes: an edited file, a new file, and the changed last chunk of a 10 MB file. The new copy matches the source, and the earlier copy is unchanged;
  - an unrelated earlier copy sends everything;
  - an offline device: the send waits, survives a restart of the sending app, stays waiting while the device is away, goes once it's reachable, and leaves the queue empty.
- **In the built desktop app** (scratch data folder, a sample paired device and a saved queue entry):
  - the waiting send is restored at start, with its badge, time and message;
  - Stop waiting empties the saved queue and offers Send when it's back.
- `pnpm typecheck`, lint, full `pnpm test`.

### Not verified

- **Update an earlier copy between two real computers:** covered end to end over sockets in tests, not on two machines.
- **A queued nearby send leaving when the device's announcement arrives:** discovery is multicast on a real network.
