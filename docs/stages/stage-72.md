# Stage 72: Mesh in the browser, for phones

The last **Not started** row that needs no money was "Mesh on phones". Native apps need paid store accounts, so a phone joins Mesh from Farbaek's web app instead.

- **Decision record:** `docs/adr/0096-mesh-in-the-browser.md`.
- **Branch:** `feat/mesh-browser`, on top of `feat/mesh-direct` (#85).

## 2026-10-27

### Done

**The protocol for the web: `src/core/mesh/web/`**, framework-free.
- **`noise.ts`:** Noise_XX_25519_AESGCM_SHA256 on Web Crypto. The device key is a non-extractable `CryptoKey`, and the pairing code and fingerprint match the agent's.
- **`wire.ts`:** the agent's framing and messages over a byte pipe (`WebSecureChannel`, `initiateWeb`).
- **`relay-pipe.ts`:** the relay's offset protocol over `fetch`.
- **`direct.ts`:** the browser's WebRTC, with Farbaek's STUN only. `SignalSchema` moves to `src/core/mesh/direct-protocol.ts`, shared with the agent.
- **`pack.ts`:** picked files hashed into a manifest under the agent's rules. Duplicate names become "name (2)", ignoring case.
- **`send.ts`:** the agent's sending steps, states and words.
- **`pair.ts`:** the pairing confirmation.

**Pairing through Farbaek.**
- The relay call `mode` can be `pair`.
- `MeshNode.openRelayPairing()` opens a two-minute window, and only while the computer is reachable. Each window allows one pairing.
- `answer()` allows pairing only on the same network or inside that window.
- The snapshot's `relay.pairingUntil` says whether the window is open.
- **Desktop:** "Pair a phone or browser" with a countdown and "Stop waiting". The card's text now says which devices are answered.

**Server.**
- `relay-routes.ts`: the relay's handlers, shared by the agent routes and the browser routes.
- `withRelayBrowser` checks:
  - the person's session in the live app;
  - a workspace;
  - same origin for writes;
  - a device id;
  - 600 requests a minute per person.
- **Routes** `/api/v1/mesh/relay/{calls, sessions/[id]/data, sessions/[id]}`.
- **Migration v61:** `app_mesh_relay_party_session_ended` records a session with a browser, as the person whose browser it was.

**Web.** On `/app/mesh`, "This phone or browser" (`PhoneMesh`) offers:
- the device's name and fingerprint;
- pairing with a reachable computer of the workspace, with the same code on both screens;
- sending picked files over the internet, with progress, how they went, and "Send through Farbaek instead";
- Forget.

The device and its pairings live in IndexedDB (`device-store.ts`). The demo shows why it's unavailable.

**Docs.**
- The privacy page says what the browser keeps.
- `docs/agent/README.md`, the threat model and current state, where the Not started row is now receiving on phones, native apps and repository hosts.

**Security.** SE-033, "A phone paired by someone in the middle".

### Verified

- `pnpm typecheck` and `pnpm lint`: clean.
- **Full suite:** 1,906 passed, 17 skipped.

  | New tests | What they cover |
  | --- | --- |
  | `noise.test.ts` (3) | The cacophony vector byte for byte; handshakes with the agent's Noise both ways, with the same code |
  | `browser-mesh.test.ts` (4) | The browser's own code against a real `MeshNode` through the relay hub |
  | `relay-browser.test.ts` (3) | The browser routes' checks |
  | `relay-hub.test.ts` | Pair mode |
  | `tests/db/mesh-relay.test.ts` | v61's function |

  The `browser-mesh.test.ts` cases cover:
  - pairing only in the window, with matching codes;
  - files checked byte for byte, with nothing readable in the relay;
  - an unpaired browser refused;
  - secrets left out.
- **`pnpm security:eval`:** 33 scenarios, 33 passed.
- **Live, a real Chromium page and a real Farbaek Agent window:**
  - **Setup:** the page ran these modules (bundled with esbuild); the local relay and STUN ran on 127.0.0.1.
  - **Pairing:** the agent opened its window, and the page paired with the same code on both screens, 010182. Both confirmed, and the agent lists "Test phone".
  - **Sending:** the page sent three files (3 MB, 50 KB, 1 KB) "Directly over the internet". The agent accepted and checked them.
  - **Result:** all three SHA-256s matched what the page sent. The relay carried 2,812 bytes for the pairing handshake and the link setup, and no file content.

- **Demo build, Mesh page:** the "This phone or browser" card with its demo reason at 1280 and 375, with no sideways scroll. `qa:a11y`: 2 views, 0 findings. `qa:responsive`: 11 views, 0 findings.
- **Migration v61** applied in production after its hash check, and read back: only the server role can run it.
- **Stage 71's production STUN server, once #85 deployed.** `node scripts/ops/stun-check.mjs` from this computer got its public address back from `www.farbaek.com:3478`. UDP 3478 is open from the internet, with no change to Hostinger's firewall.

### Not verified

- **A real phone on a mobile network,** which needs the owner's phone and workspace.
- **The `PhoneMesh` card signed in against production,** because the demo can't reach computers. The card's code paths are the modules above.

### Next

- **Stage 73: receiving on a phone.** The phone is reachable while the page is open, and a computer sends to it. Files download one by one or as a zip.
