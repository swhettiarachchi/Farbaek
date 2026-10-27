# ADR 0097: Receiving on a phone or browser

- Status: accepted (2026-10-27).
- Spec §11 (Mesh) and §17 (mobile), the "Mesh on phones" row.
- Builds on ADR 0094 (relay), ADR 0095 (direct links) and ADR 0096 (Mesh in the browser).
- No migration.

## Context

ADR 0096 let a phone, or any browser, pair with a person's computer through Farbaek and send it files. The other direction was missing: a computer sending a folder to the phone. Native apps are still out of reach (no budget for store accounts). So the phone receives in the browser, with the same protocol, relay, STUN server and WebRTC as before, and no third party.

A browser can't listen on a port, can't run in the background on a phone, and can't write wherever it likes. The design follows from those three limits.

## Decision

**Reachable while the page is open, by the person's choice.** On `/app/mesh`, "Be reachable while this page is open" is a switch, off on every page load.
- When on, `WebMeshListener` (`src/core/mesh/web/listen.ts`) does what the agent's "Reachable through Farbaek" loop does, over `fetch`. It says so to the relay (`POST /api/v1/mesh/relay/presence`), then long-polls for calls (`GET …/presence?wait=25`).
- **Presence is kept in the relay's memory only.** Browsers aren't recorded in the database. The server forgets a browser once it stops polling (the page closed, or the phone locked or slept). The page says so beside the switch.
- **After a server restart,** the hub answers `NOT_REACHABLE`, and the listener says it's reachable again. A signed-out session or a lost workspace stops the loop, with words.

**Who's answered.**
- **Calls from computers the browser didn't pair with** are closed without being joined.
- **`pair` calls are closed:** a browser pairs only as the caller (ADR 0096).
- **After the handshake,** the computer's key must be the one stored when pairing, whatever fingerprint the call claimed. Otherwise the browser answers `not_paired` and closes (SE-034).

**How the files travel.** The computer's "Send over the internet" is unchanged: `MeshNode.sendOverInternet` reaches any paired device by fingerprint.
- **A `direct` call:** the browser answers with `answerDirectWeb`. It waits for the offer, answers, trades candidates, and takes the data channel from `ondatachannel`, using Farbaek's STUN only.
- **A `relay` call:** the session is used as it is. The sender chose the relay; it's never chosen silently.
- **Then** `respondWeb`, the responder side of the same Noise XX handshake.

**What the browser checks.** `readOfferWeb` and `WebIncoming` (`src/core/mesh/web/receive.ts`) mirror the agent's `IncomingTransfer`:
- **The list of files:** its size, the Capsule schema, its digest, and `checkManifest` with the agent's limits and disk-path rules. A path that climbs out of its folder is refused before the person is asked.
- **Every 4 MiB chunk** with `ChunkHasher`, and every whole file against its BLAKE3 hash. Only then is "verified" sent.
- **On a mismatch, a cancel from either side, or an error,** everything received is removed. A dropped connection also keeps nothing: a browser has no resume across page loads, so accept always answers with empty resume points. The sender's Resume starts again from the beginning.
- **States and words** are the agent's.

**Where the files are kept** (`src/core/mesh/web/sinks.ts`).
- **The Origin Private File System** when the browser can write to it (`createWritable`), in a folder per transfer. Space is checked first with `navigator.storage.estimate()`, keeping 64 MB spare.
- **Memory otherwise,** capped at 200 MB. A larger offer shows Accept as unavailable, with the reason.
- **A transfer is sealed** (`<id>.json` beside its folder) only after every file matched. After a reload, sealed transfers are offered again with Save and Clear. Unsealed folders were never checked to the end, so they're removed.
- **Nothing received is opened or run.** Each file is handed to the browser's own download by its name (Save, or Save all one by one), or to the phone's share sheet where the browser supports sharing files. Clear removes them from the browser.

**The computer side** knows which devices are phones. A pairing through a window stores `via: "farbaek"` in the agent's trust store. Nearby's "Send to" shows "(phone or browser)". For those devices:
- **Send** (this network) is unavailable, with the reason;
- **when the phone isn't reachable,** the message says to open Mesh in Farbaek on it and turn on Be reachable.

Devices paired before Agent 0.6.0 show as computers until paired again.

## Consequences

- **A computer can now send a folder to a phone** with no app, no store and no cost, directly when the networks allow it.
- **The page must stay open.** Phones suspend background tabs, so a transfer stops if the phone locks. The person is told, and the sender can send again.
- **Saved files lose their folders,** because browsers download files one at a time by name. The list shows each file's path. A zip was considered and left out: it would hold everything in memory a second time and add a dependency.
- **Checked live:** a real agent window sent a folder (6.9 MB, three files, with `.env` left out on the computer) to a real Chromium page running these modules. It went over a real WebRTC data channel. All three SHA-256s matched, and the relay carried 2,812 bytes in total, for pairing and setup.
- **Not checked:** a real phone on a mobile network, and iOS Safari's OPFS and download behaviour. These need the owner's phone.
