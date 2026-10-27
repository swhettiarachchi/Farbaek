# Stage 71: Mesh direct over the internet

The owner asked for direct computer-to-computer links across networks, built without outside services. Spec §11, "Direct Remote".

- **Decision record:** `docs/adr/0095-mesh-direct.md`.
- **Branch:** `feat/mesh-direct`, from `main` after #84.

## 2026-10-26

### Done

**Farbaek's own STUN server.**
- `deploy/vps/stun/stun-server.mjs`, using only Node's `dgram` and `zlib`.
  - It answers RFC 5389 Binding requests with XOR-MAPPED-ADDRESS and FINGERPRINT, and ignores anything else.
  - It answers each address at most 30 times in 10 seconds, with at most 52 bytes.
- **Compose:** a new `stun` service, in the app's Node image, read-only, as `node`, with no capabilities, its own network, 64 MB, and UDP 3478 published.
- `scripts/ops/stun-check.mjs` asks any STUN server for this computer's public address.

**Signaling and calls.**
- `direct-signal.ts`: setup messages as checked lines of JSON (an SDP of at most 16 KB, at most 64 candidates, lines of at most 20 KB), and `DirectError`.
- A relay call carries `mode: relay | direct` through the hub, the `calls` route and `RelayClient`.

**`MeshNode`.**
- The `direct` option.
- `sendOverInternet` (direct first, or relay) and `useRelay`, which switches a transfer only after the person chooses it.
- Answering a direct call opens the link, then runs the same `answer()`. Without direct support, a direct call is declined.
- The snapshot gains `via: direct`, `canUseRelay` and `relay.direct`.

**Desktop.**
- `desktop/src/main/direct.ts`: a `DirectBridge` with a hidden, sandboxed window made on first use and closed with the app.
- MessagePort control and data, with backpressure.
- The setup channel closes once the data channel opens. It gives up after 20 seconds.
- `desktop/src/rtc/` holds the preload that owns the `RTCPeerConnection` and the data channel, and an empty page with CSP `default-src 'none'`. `build.mjs` bundles them.
- `FARBAEK_AGENT_TEST_RELAY` is a development-only override, for the live check.
- **The Nearby screen:**
  - "Over the internet" with "Be reachable over the internet";
  - "Send over the internet";
  - "Directly over the internet, encrypted end to end" on direct transfers;
  - "Send through Farbaek instead" and "Try directly again" when a direct link is blocked.

**Web and docs.**
- The Mesh page and the privacy page say what the server and the other computer learn.
- `docs/agent/README.md`, `docs/deploy/vps.md`, the threat model, and current state.

**Security.** SE-032, "A direct link set up by an untrusted server".

### Verified

- `pnpm typecheck` and `pnpm lint`: clean.
- **Full suite:** 1,893 passed, 17 skipped.

  | New tests | Count |
  | --- | --- |
  | `tests/stun/stun-server.test.ts` (RFC 5769 vectors, junk, limits, a real UDP round trip) | 5 |
  | `direct-signal.test.ts` | 3 |
  | `mesh.test.ts` "directly over the internet" | 4 |

  The `mesh.test.ts` cases cover:
  - delivered with only setup through the relay;
  - blocked, then the relay only after the person chooses it;
  - declined without direct support;
  - a swapped link carries nothing.
- **`pnpm security:eval`:** 32 scenarios, 32 passed.
- **Live, two real Farbaek Agent windows on this computer:** each had its own scratch data folder, with a local relay over the real hub and the STUN server on 127.0.0.1.
  - Paired nearby with matching codes, then "Be reachable over the internet", then "Send over the internet".
  - Chromium's WebRTC opened a data channel, and a 2.9 MB folder was delivered and checked.
  - The received file's SHA-256 matched (`f18a1d92…`).
  - Both windows show "Directly over the internet".
  - The relay carried 2,438 bytes, with no file content.
- **`stun-check.mjs`** against a local STUN server reports the mapped address.

### Not verified

- **The production STUN server,** which runs after merge. Then run `node scripts/ops/stun-check.mjs`. If it gets no answer, Hostinger's panel firewall needs UDP 3478 open.
- **Two computers behind different real NATs,** which needs two agents paired with the owner's workspace.
- **The blocked-link fallback in the real app.** On one computer a direct link always opens, so it's covered by `mesh.test.ts` only.
