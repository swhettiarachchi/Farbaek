# ADR 0038: Mesh nearby transfer between Farbaek Agents

- Status: accepted (2026-10-22).
- Spec: §11 (Farbaek Mesh), Stage 5. Phase B; phase A is ADR 0037 (Workspace Capsules).

## Context

The spec asks Mesh for one proven end-to-end path first: transfer on the local network between the desktop companion and another desktop. It must have:
- discovery the person starts;
- pairing the person approves, which expires in 2 to 5 minutes, using a PAKE or a Noise XX handshake with out-of-band key confirmation;
- mutual authentication, encryption and replay protection;
- 4 MiB chunks with per-chunk and whole-file BLAKE3;
- real progress, resume, cancel, backpressure and quota checks;
- explicit acceptance of every incoming transfer, and revocation;
- no whole-file buffering and no execution;
- success only after the receiver verifies.

The Farbaek Agent's main process is Electron 43, with Node 24 on BoringSSL. Checked inside Electron:
- **Available:** X25519, AES-256-GCM (a bad tag is rejected), SHA-256, HMAC and HKDF.
- **Not available:** ChaCha20-Poly1305 through Node's cipher API.

## Decision

### Cryptography: `Noise_XX_25519_AESGCM_SHA256`, on `node:crypto`

- `src/agent-runtime/mesh/noise.ts` implements the Noise Protocol Framework (revision 34) XX pattern step by step: CipherState, SymmetricState, HandshakeState and Split.
  - AES-GCM nonces are four zero bytes and a big-endian 64-bit counter, as Noise specifies.
  - A failed decryption leaves the counter where it was.
  - Messages are at most 65,535 bytes.
- It matches the published cacophony test vector for this exact suite: every handshake message, the handshake hash and the transport messages. That test passes under Node's OpenSSL and under Electron's BoringSSL (`ELECTRON_RUN_AS_NODE`).
- No new dependencies. BLAKE3 is `@noble/hashes`, already used by Capsules.
- The prologue `farbaek-mesh/1` binds every handshake to this protocol and version.

### Identity and pairing

- **Device key:** each agent has a long-term X25519 key, made on first use of Nearby and encrypted with Electron `safeStorage` (the system keychain) as `mesh-device-key`. Without a keychain, Nearby says so and doesn't run.
- **Trusted devices:** stored by public key, with the name given at pairing, in `mesh-devices.json`. That file holds public keys only.
- **Pairing** is a Noise XX handshake. Both screens then show a **six-digit code** derived from the handshake hash (HKDF, label `farbaek-mesh/1 code`), plus the other device's key fingerprint.
  - Both people must confirm the codes match within **two minutes**. Each confirmation travels encrypted.
  - Only when both are yes does each side store the other.
  - A relay in the middle would hold two different handshake hashes, so the codes differ. That is numeric comparison, as in Bluetooth.
  - One pairing at a time.

### Discovery

- UDP multicast on `239.255.70.66:53366`, TTL 1. It runs only while the person has chosen **Be visible** (five minutes) or **Look for computers** (five minutes).
- Announcements carry the protocol, a display name, the key fingerprint and the TCP port. They grant nothing.
- The TCP listener exists only while the device is visible.
- **Connect by address** covers networks that isolate clients. A visible device shows its address and port.

### Transfer (`src/core/mesh/protocol.ts`, `src/agent-runtime/mesh/`)

1. **Handshake.** A fresh Noise XX handshake, so every session has new keys and a replayed session fails. Each side refuses unless the other's static key is trusted, so authentication is mutual. A forgotten device is refused with "not paired".
2. **Offer.** The sender offers the session id, the manifest digest and the manifest: a `farbaek.capsule/1` manifest of the folder it packed.
   - Packing applies the import screening: credentials files, `.env` files and keys, dependency and build folders, links, and text that looks like a secret.
   - Binary files may travel between computers.
3. **Checking the offer.** The receiver checks the digest and runs `checkManifest` (shared with Capsules) with the rules for names on a real disk: traversal, absolute paths, NFC, case collisions, Windows device names, screened names, chunk layout, and the limits (10,000 files, 2 GiB per file, 4 GiB in all).
4. **Acceptance.** The person must accept and choose where it goes.
   - It goes into a **new folder** inside the chosen one, never over an existing folder.
   - Free space is checked first.
   - Declining writes nothing.
5. **Streaming.** Files stream in pieces of about 60 KiB, waiting for `drain`; the reader pauses the socket when messages pile up.
   - The receiver writes at explicit positions into `.farbaek-incoming/<session>/` and hashes as it goes.
   - It checks every 4 MiB chunk the moment it completes, and the whole file at its end.
   - A checkpoint records the verified chunks.
6. **Finishing.** Only when every file has matched are the files moved into place through the folder guard (no links, exclusive creates) and `verified` sent. The sender shows "Delivered" only then.
7. **Failures.**
   - A mismatch stops the transfer, and the receiver removes the folder it made.
   - A file edited on the sending computer after packing is caught by the sender's own re-check.
   - A dropped connection keeps the verified chunks. **Resume** re-handshakes, re-offers the same session and digest, and continues from the last verified chunk.
   - Nothing received is ever run.

### The app

- **Nearby** is in the agent's navigation, and reachable from the pair screen without a Farbaek account: local transfer doesn't need one.
- The main process owns everything (`desktop/src/main/mesh.ts`). The window only gets snapshots and asks for actions through validated handlers.
- Folders are chosen in the system dialog. A development-only override (`FARBAEK_AGENT_TEST_SEND_FOLDER`, `FARBAEK_AGENT_TEST_SAVE_FOLDER`), ignored by packaged builds, lets an automated check drive two windows.

## Consequences

- **Checked so far:** two agents on one computer found each other by multicast, paired with matching codes, and moved a 12 MB project. The received files' SHA-256 matched the originals, and `.env` and `node_modules` stayed behind. Transfer between two physical computers on a real network hasn't been checked yet; the docs say so until the owner has done it.
- **Not built:**
  - mobile apps (Stage 7);
  - mDNS/Bonjour (`_farbaek._tcp`, which iOS needs);
  - WebRTC or QUIC for remote transfer;
  - an end-to-end encrypted relay (only with consent);
  - resume after either app restarts (the checkpoint is on disk, but the session lives in memory).
- **Who a device is:** a device's name is what it says about itself; its key is what pairing proves. The fingerprint is shown during pairing and in the device list.
- **Windows firewall:** Windows may ask to allow the agent on private networks the first time it's visible. The window says so.
