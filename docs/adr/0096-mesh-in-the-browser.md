# ADR 0096: Mesh in the browser, for phones without an app

- Status: accepted (2026-10-26).
- Spec §11 (Mesh) and §17 (mobile), the "Mesh on phones" row.
- Builds on ADR 0038 (nearby), ADR 0094 (relay), ADR 0095 (direct links) and ADR 0079 (the installable app).
- Migration v61 (`20261202090000_mesh_browser.sql`).

## Context

Mesh moved folders only between Farbaek Agents on computers. Phones were left out: native iOS and Android apps need paid developer accounts and store reviews, and the owner has no budget for either. A phone browser, or Farbaek installed from it as an app, already has what Mesh needs:
- Web Crypto X25519, AES-GCM, HMAC and SHA-256, for the same Noise handshake;
- WebRTC, for direct links through Farbaek's STUN server;
- `fetch`, for the relay.

## Decision

**The same protocol, implemented for the web, in `src/core/mesh/web/`.** It's framework-free and uses only Web APIs, so it runs in vitest on Node 24 as well as in browsers.
- **`noise.ts`:** Noise_XX_25519_AESGCM_SHA256 on Web Crypto.
  - It matches the cacophony vector byte for byte.
  - It completes handshakes with the agent's node:crypto implementation both ways, with the same pairing codes and fingerprints.
  - The device key is a non-extractable `CryptoKey`.
- **`wire.ts`, `send.ts`, `pair.ts`:** the agent's framing, messages, sending steps, states and words, and pairing confirmation. They're byte-compatible, so the agent receives from a browser with no change.
- **`relay-pipe.ts`:** the relay's offset protocol over `fetch`.
- **`direct.ts`:** the browser's own WebRTC, with Farbaek's STUN only.
- **`pack.ts`:** a manifest from picked files, with the agent's rules for names, secrets and sizes.

**Pairing a phone through Farbaek.** Nearby pairing needs both computers on one network, and a phone browser can't open sockets. So:
1. On the computer, the person chooses "Pair a phone or browser". That opens a two-minute window, and only while the computer is reachable over the internet.
2. The phone calls it through the relay with the call marked `pair`.
3. Both screens show the six-digit code from the Noise handshake hash, and both people confirm.

**Why the server can't pair anyone in the middle.** It could relay two separate handshakes, but then the codes differ (SE-033). Outside a window, a pairing call isn't answered, and each window allows one pairing. This replaces ADR 0094's "the relay never pairs" with "the relay pairs only inside a window the person opened, and only after both confirm the same code".

> **Correction (2026-11-12, ADR 0194).** The claim above, that the codes match only if no one sat in the middle, the server included, was false until ADR 0194. With the code taken from the handshake hash alone, the server could call the computer itself and try handshake payloads until its code matched the phone's. Since ADR 0194 the code also depends on a random value from each device, committed before the other's is known, so each try in the middle matches with probability one in a million, and a window answers one call, so the server gets one try per window the person opens. Older versions are refused, and the protection holds only when both devices are on the new version.

**A browser's identity on the server.** Browser routes at `/api/v1/mesh/relay/*` use the person's session. `withRelayBrowser` checks:
- the live app;
- a workspace;
- same origin for writes;
- a device id header;
- 600 requests a minute per person.

In the hub, a browser is `browser:<user>:<device>` in the person's current workspace. The shared handlers (`relay-routes.ts`) apply exactly the agent routes' checks. A session with a browser is audited by v61's function as the person whose browser it was.

**What this stage does:** phone or browser to computer. On `/app/mesh`, "This phone or browser" offers:
- naming the device;
- pairing with a reachable computer of the workspace;
- sending picked files over the internet, directly when possible, and "Send through Farbaek instead" when a direct link is blocked.

The computer accepts and checks every chunk as for any device.

## Consequences

- Phones join Mesh with no app store and no cost. Sending happens in the browser while the page is open; phones suspend background tabs, so the page says to keep it open.
- **Checked live:** a real Chromium page running these modules paired with a real Farbaek Agent (the same code on both screens), then sent three files over a real WebRTC data channel. All three SHA-256s matched, and the relay carried 2,812 bytes of pairing and setup, with no file content.
- **Not built yet:** receiving on the phone (computer to phone, Stage 73), and nearby discovery between a phone and a computer, since browsers can't do mDNS.
- **Clearing the browser's site data** forgets its key and pairings. The computer keeps the old entry until the person removes it with Forget.
