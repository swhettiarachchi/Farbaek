# Stage 73: receiving on a phone or browser

Stage 72 let a phone send to a paired computer. This stage adds the other direction: the computer sends a folder to the phone. It needs no app, no store and no new service.

- **Decision record:** `docs/adr/0097-mesh-receiving-in-the-browser.md`.
- **Branch:** `feat/mesh-browser-receive`, from `main` after #86.

## 2026-10-27

### Done

**The browser as the one called: `src/core/mesh/web/`.**
- **`wire.ts`:** `respondWeb`, the responder side of the Noise XX handshake, as the agent's `respond`.
- **`direct.ts`:** `answerDirectWeb`. It waits for the offer, answers, trades candidates, and takes the data channel from `ondatachannel`. Its handlers go on at once, because the computer starts its handshake as soon as the channel opens.
- **`relay-pipe.ts`:** `setReachable`, `waitForCalls` and `join`.
- **`listen.ts`:** `WebMeshListener`, the agent's "Reachable through Farbaek" loop:
  - closes calls from unpaired computers, and pair calls, without joining;
  - checks the handshake's key against the paired one;
  - says it's reachable again after a server restart, and stops with words when signed out.
- **`receive.ts`:** `readOfferWeb` and `WebIncoming`, with the agent's checks, states and words.
  - Every chunk and file is checked against its BLAKE3 hash.
  - A mismatch, cancel or drop keeps nothing.
  - A computer that gives up while the person decides is noticed from the first message.
- **`sinks.ts`:**
  - **`opfsSink`:** the Origin Private File System, with a space check.
  - **`memorySink`:** up to 200 MB.
  - **Sealing:** only a fully checked transfer is sealed. `opfsKept` lists sealed transfers after a reload and removes unsealed folders.

**Server.**
- **New shared handlers:** `handleBrowserPresence` (in the hub's memory only, no database record) and `handleWaitForCalls`.
- **New routes:** `/api/v1/mesh/relay/presence` (POST and GET) and `/api/v1/mesh/relay/sessions/[id]/join`.
- The agent's presence GET uses the shared handler.

**Agent 0.6.0.**
- The trust store records `via: "farbaek"` for devices paired through a window.
- Nearby's "Send to" shows "(phone or browser)". Send on this network is unavailable for them, with the reason, and `MeshNode.send` refuses them too.
- When a phone isn't reachable, the message says how to turn it on there.

**Web.** "Receive files" in `PhoneMesh` (`receive-files.tsx`):
- **The switch:** "Be reachable while this page is open", as a pill switch with words and an icon. It's unavailable until something is paired, and says when it stops.
- **The offer:** who's sending, with their fingerprint, the files and their size, and what stayed on the computer. Then Accept or Decline. Accept is unavailable above 200 MB when the browser can only keep files in memory.
- **While receiving:** progress, how the files are travelling, and Cancel.
- **When done:** each file with Save, and Share where the browser can share files, plus Save all and "Clear from this browser". Where the files are kept is said in words.
- **After a reload:** checked transfers kept from before, with Save and Clear.

**Docs.**
- The privacy page: presence is kept in memory only, and received files stay in the browser until cleared.
- The threat model, current state, and the agent README.

**Security.** SE-034, "A phone receiving from someone it didn't pair with".

### Verified

- `pnpm typecheck` and `pnpm lint`: clean.
- **Full suite:** 1,914 passed, 17 skipped.
- **New tests:**

  | Tests | What they cover |
  | --- | --- |
  | `browser-receive.test.ts` (6) | A real `MeshNode` sending to the browser's listener through the relay hub |
  | `relay-browser.test.ts` (+1) | Presence in memory, calls from the same workspace only, and join with its origin check |
  | `mesh.test.ts` | Nearby pairings stored as nearby |

  The `browser-receive.test.ts` cases cover:
  - delivered through the relay, byte for byte, with nothing readable in the relay;
  - delivered over a stand-in direct link, with only the setup in the relay;
  - decline;
  - a forgotten computer not answered, and another key refused;
  - a changed chunk keeping nothing, and a climbing path refused at the offer;
  - signed out.
- **`pnpm security:eval`:** 34 scenarios, 34 passed.
- **Live, a real Farbaek Agent 0.6.0 window and a real Chromium page:**
  - **Setup:** the page ran these modules (bundled with esbuild); the local relay and STUN ran on 127.0.0.1.
  - **Pairing:** the same code on both screens, 433753, and both confirmed.
  - **The agent's Send to:** it showed "Test phone (phone or browser)", with Send unavailable and its reason.
  - **Sending:** "Send over the internet" offered a 6.9 MB folder of three files, with `.env` left out on the computer. It arrived "via direct", over Chromium's WebRTC on both sides.
  - **Result:** the page accepted and checked every file in about 2 seconds. All three SHA-256s matched the files on disk, and the agent said "Delivered. Test phone checked every file against its hash." The relay carried 2,812 bytes in total, for pairing and setup, and no file content.

- **The cards, in a demo build at 375 and 1280.** A temporary route, not committed, showed the switch and an offer, receiving, done and stopped card with sample data.
  - At 375, long names wrapped. There was no sideways scroll, and no target was under 44 px.
  - `qa:a11y` on that route and `/app/mesh` (1280 and 375) found only the temporary route's missing h1.
  - `qa:responsive` on `/app/mesh`, `/privacy` and that route (11 widths each): 0 sideways scroll, 0 cut off, 0 small targets.
  - It found one real bug: the offer card read the browser's storage support during render, so a server render and the browser's disagreed (React error 418). It now reads it with `useSyncExternalStore`, and a rebuild showed no errors.

- **Agent 0.6.0 published:** `Farbaek-Agent-Setup-0.6.0.exe`, 113,873,285 bytes, SHA-256 `220118bf…80f37e`. It was uploaded in 14 hashed pieces, every piece and the whole file were checked on the server, and the download is served.
  - The first upload stalled after 8 pieces. SSH timed out, and the server then refused new connections for a while.
  - After waiting, the other 6 went up in a single connection.

### Not verified

- **A real phone on a mobile network,** iOS Safari's private file system, and its downloads. These need the owner's phone and workspace.
- **The signed-in Mesh page against production:** the demo has no computers to reach.

### Next

- Choose the next stage from the remaining rows in current state.
