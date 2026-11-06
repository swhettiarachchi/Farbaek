# Farbaek Agent

A desktop app that works on a task's approved intent contract on your computer, using Farbaek's AI through the model gateway (no API key needed), and hands the finished change to Farbaek as a normal change proposal for review. Decisions: [ADR 0018](../adr/0018-farbaek-agent-runtime.md), [ADR 0021](../adr/0021-model-gateway-and-auto-routing.md).

## How it fits

1. In Farbaek, approve a task's intent contract.
2. In the app, pick the task, a mode and an effort (Fast, Balanced or Deep), and start a run. The app copies the project's files into its own folder for that run.
3. The agent works in that copy. Every tool call is validated, checked against the mode and the contract, and, when needed, approved by you.
4. You review the result in the app and submit it. Farbaek checks it again (paths, file screening, base revisions, contract, policy, evaluation allowance) and creates a proposal tagged "Proposed by Farbaek Agent".
5. From there it's the same as any proposal: per-chunk review, apply, checks on Vercel Sandbox, ProofPack, recovery.

### After you submit

Farbaek's review decides what happens to the change. The app shows where it stands, checking every 30 seconds while it can still change and the window is visible, or when you choose **Check now** (Approval Wallet, [ADR 0042](../adr/0042-approval-wallet.md)):
- **Waiting for review,** with the time it can still be approved. A proposal can be approved for 72 hours.
- **Expired:** discard it in Farbaek, then start a new run.
- **Applied, not verified,** then **Verified** or **Checks failed,** with the approved content's hash and the ProofPack.
- **Discarded in Farbaek.**

When it submits, the app works out the proposal's hash from exactly what it sent. Each check compares that with the hash Farbaek holds. If they differ, the app says not to approve it.

## Modes

| Mode | Files | Commands | Where |
| --- | --- | --- | --- |
| Review Only | A patch in memory; nothing on disk changes | None | This computer |
| Controlled Development | The run's copy, with a checkpoint before each write | Every command waits for approval, since nothing keeps it apart from the rest of the computer (ADR 0175) | This computer, **not isolated** |
| Sandboxed Autopilot | Not available yet | Not available yet | Needs the agent to reach Farbaek sandboxes, which isn't built |

Writes must stay inside the contract's paths and allowed operations, and are refused if they look like they contain a secret or touch a credentials file. Installs always get `--ignore-scripts` unless you approve otherwise.

## Limits

- 40 model steps, 3,000,000 tokens and 45 minutes per run (`DEFAULT_RUN_LIMITS` in `src/agent-runtime/loop.ts`).
- Commands: 5 minutes by default, 30 at most; 64 KB of output kept per stream.
- Files: 512 KB per file read or written; 5,000 files walked; 100 search matches.

## Pairing and the model

- **Pairing:** in Farbaek, open Agents and create a code. Type it into the app with Farbaek's address. The code works once, for 10 minutes. The app gets a token that only it stores, encrypted with the system keychain; Farbaek keeps only its hash. Your plan sets how many agents can be paired.
- **The model:** each step goes to `POST /api/v1/agent/model`. Farbaek picks the model for your plan and the effort (Auto routing), calls Claude with its own key, and meters the step from the workspace's AI usage at its real token cost. Refusals and provider failures are given back. Farbaek doesn't keep the conversation; the usage ledger records the model and token counts. Versions before the gateway stored a personal key; the app now deletes it on start.
- **The lease (ADR 0117):** each agent holds a permission lease that ends at most 90 days ahead and names its projects, what it may do (read tasks and files, propose changes, use Farbaek's AI, Mesh) and how many requests an hour. A new agent gets 90 days on every project with everything. Owners, admins and the person who paired it renew or change the lease on the Agents page; each change is in the audit log. Once it ends, the agent can only unpair until someone renews it. The app warns 14 days ahead.
- **Revoking:** from Agents in Farbaek (owners, admins, or the person who paired it), or Settings → Unpair in the app. A revoked token stops working on the next request, and the app forgets it.
- If the system keychain isn't available (for example Linux without a running keyring), the app refuses to store anything secret.

## Nearby: folders between your computers

Nearby (Mesh phase B, ADR 0038) sends a folder straight to another computer on the same network, with no Farbaek account needed and nothing passing through Farbaek's servers. Paired computers on different networks can also send through Farbaek's relay (below).

1. **Be visible.** On the receiving computer, open Nearby and choose **Be visible**. It lasts five minutes. Windows may ask to allow Farbaek Agent on private networks the first time.
2. **Pair, once.**
   - On the sending computer, choose **Look for computers**, then **Pair**.
   - Both screens show a six-digit code. Confirm on both only if the codes match. A different code means something is between the two computers.
   - If the network hides computers from each other, use **Connect by address** with the address and port the visible computer shows.
3. **Send.** Choose a folder and see what's included and what stays behind (credentials, `.env` files, keys, dependency folders, secret-looking text; detection isn't guaranteed), then choose the paired computer.
4. **Accept.** The receiving computer shows the offer. Accept and choose where it goes: it's saved into a new folder there.

Every 4 MiB piece is checked against its BLAKE3 hash as it arrives, and the sender shows "Delivered" only after the receiver has checked every file. If the connection drops, **Resume** carries on from the last checked piece. **Forget** a paired computer to stop it sending to or receiving from this one. Nothing received is ever run.

**Checked so far:** two agents on one computer. Transfer between two physical computers on a real network is still to be checked.

### Over the internet: paired computers on different networks (ADR 0094, ADR 0095)

Both apps must be paired with the same Farbaek workspace, and the two computers paired with each other once, on the same network, as above. Nothing over the internet ever pairs computers.

1. On the receiving computer, under **Over the internet**, choose **Be reachable over the internet**. It stays on while the app is open.
2. On the sending computer, choose the folder and the paired computer, then **Send over the internet**.
3. Accept on the receiving computer, as for Nearby.

Farbaek first tries a **direct link**. Its own STUN server (UDP 3478 on the Farbaek host) tells each computer its public address, the two exchange connection details through Farbaek, and Chromium's WebRTC opens a data channel straight between them. The files never touch the server. Some networks block direct links (most phone hotspots, many offices): then the transfer stops and offers **Send through Farbaek instead**, which uses the relay below. It never switches by itself.

Through the relay, the two agents run the same Noise handshake, offer, checks and resume through Farbaek's server as they do on a network, so the server only passes ciphertext along. Bytes wait in its memory, at most 8 MiB in each direction, only while both apps are connected, and are gone when the transfer ends. Each workspace can relay 5 GB a day; the Mesh page shows how much of today's allowance is used.

### A phone or browser (ADR 0096)

A phone needs no app. On the computer, with **Be reachable over the internet** on, choose **Pair a phone or browser**: it waits two minutes. On the phone, sign in to Farbaek, open **Mesh**, and under **This phone or browser** choose the computer and **Pair**. The same six-digit code shows on both screens; confirm on both. Then pick files on the phone and **Send over the internet**, and accept them on the computer.

To send to the phone (ADR 0097), turn on **Be reachable while this page is open** under **Receive files** on the phone, and keep the page open. On the computer, choose the folder, pick the phone in **Send to** (it shows "(phone or browser)") and choose **Send over the internet**; **Send** on this network is unavailable for phones. Accept on the phone. Every piece is checked there, and the files stay in the browser until you save or clear them. Phones paired with Agent 0.5.0 show as computers until paired again.

**Checked so far:** the relay with two agents in one process through the real hub (`mesh.test.ts`); a direct link between two real agent windows on one computer, through a local relay and Farbaek's STUN server, in Chromium's WebRTC. A transfer between two computers on different networks is still to be checked.

To check Nearby by script, run two windows with separate scratch data folders (`FARBAEK_AGENT_DATA_DIR`) and the development-only folder overrides `FARBAEK_AGENT_TEST_SEND_FOLDER` and `FARBAEK_AGENT_TEST_SAVE_FOLDER`, which packaged builds ignore.

## Building

```bash
pnpm agent:dev
```

```bash
pnpm agent:dist
```

`agent:dev` bundles the app into `desktop/app` and opens it. `agent:dist` builds the production bundle and the direct Windows installer (NSIS, not code-signed) in `desktop/release` (about 114 MB, almost all of it the Electron runtime). The window's fonts (Geist, SIL Open Font License) are downloaded once at build time; without network, the app uses system fonts.

### Installing without a warning (ADR 0098)

- **Windows, from the Microsoft Store.** Microsoft signs the Store package, so people choose Get and it installs with no warning, and updates itself. `pnpm agent:store` builds the package (`desktop/store.mjs`), unsigned, with the identity in `desktop/store-identity.json`. Installed from the Store, the agent keeps its data in `%USERPROFILE%\.farbaek-agent`, because Windows redirects a package's writes under AppData, and the commands a run starts must see its working copy (`desktop/src/main/data-dir.ts`).
- **Windows, the direct installer.** `pnpm agent:dist` builds an NSIS installer that isn't code-signed: SmartScreen shows "Windows protected your PC" until people choose More info, then Run anyway. The Agents page shows these steps, folded away once the Store listing is up.
- **Mac.** `.github/workflows/agent-mac.yml` builds one DMG for Apple silicon and Intel on GitHub's macOS runner, signs it with the owner's Developer ID (team 65BULQ4657) and has Apple notarize it, then checks Gatekeeper accepts it as notarized before keeping it. It runs only once the five signing secrets are set.

### Mac signing, once (the owner)

1. Accept the latest Apple Developer Program License Agreement at developer.apple.com/account when Apple asks: certificates and notarization stop until it's accepted.
2. In PowerShell: `powershell -ExecutionPolicy Bypass -File scripts\release\mac-signing.ps1 -Step request`. It makes a private key and a certificate request in `%USERPROFILE%\FarbaekMacSigning` and opens Apple's page: choose Developer ID Application, then G2 Sub-CA, upload `developer-id.csr`, and download the certificate into that folder.
3. At appstoreconnect.apple.com: Users and Access, Integrations, App Store Connect API, Team Keys, Generate, with Developer access. Download the `AuthKey_….p8` (offered once).
4. `powershell -ExecutionPolicy Bypass -File scripts\release\mac-signing.ps1 -Step github`. It checks the certificate is a Developer ID Application for the team and belongs to the key, makes the `.p12`, and copies each of the five secrets to the clipboard in turn while GitHub's New secret page is open. Nothing secret is shown on screen.

Keep `%USERPROFILE%\FarbaekMacSigning` private and out of the repository: it holds the key that signs the Mac app.

### Microsoft Store, once (the owner)

1. Register at storedeveloper.microsoft.com as an individual (free; Microsoft checks an ID and a selfie).
2. In Partner Center, reserve the name "Farbaek Agent". Under the app's Product management, Product identity, copy `Package/Identity/Name`, `Package/Identity/Publisher` and `Package/Properties/PublisherDisplayName` into `desktop/store-identity.json`. They're public.
3. `pnpm agent:store`, then upload the `.appx` from `desktop/release` in a new submission, with the listing from `docs/agent/store-listing.md`. Submit to a private audience first and install it from the Store to check it, then make it public.
4. Set `AGENT_STORE_URL` in `src/config/agent-download.ts` to the listing's apps.microsoft.com address.

### Publishing a release (ADR 0077, ADR 0098)

People get the agent from the Agents page. Direct downloads are served at `https://www.farbaek.com/downloads/<file>` from `/opt/farbaek/downloads` on the server.

1. Raise the version in `desktop/app/package.json`. Pushing it starts the Mac build.
2. Windows: `pnpm agent:dist`, then copy `desktop/release/Farbaek-Agent-Setup-<version>.exe` to `/opt/farbaek/downloads` over SSH in one connection, and compare its SHA-256 on the server with the local one.
3. Mac: download the run's artifact, check its SHA-256 against the run's summary, and copy the DMG to `/opt/farbaek/downloads` the same way.
4. Linux (ADR 0111): the same push starts the Linux build (`.github/workflows/agent-linux.yml`). Download its artifact, check the AppImage's SHA-256 against the run's summary, and copy it to `/opt/farbaek/downloads` the same way.
5. Store: `pnpm agent:store`, and submit the package as an update in Partner Center.
6. Set the files, sizes and SHA-256s in `src/config/agent-download.ts` (`AGENT_DOWNLOAD`, `AGENT_MAC`, `AGENT_LINUX`). `src/config/agent-download.test.ts` checks the entries are well formed and match the app's version.
7. Merge. The page links the new files once it deploys.

Old installers stay on the server, so earlier links keep working. Remove them by hand when they're no longer needed.

## Agent API

`/api/v1/agent`, authenticated with `Authorization: Bearer fa_…` (except pairing):

| Method and path | What it does |
| --- | --- |
| `POST /pair` | Redeems a pairing code; returns the token once |
| `GET /me` | The agent, workspace, the person's role, its lease, whether a verified sandbox is connected, and the newest version of the app, so it can say when it's out of date |
| `GET /tasks` | Tasks whose contract is approved and that are waiting for a change |
| `GET /tasks/{id}` | The task, its approved contract and the project's file list |
| `GET /tasks/{id}/files?after=` | File contents in pages of up to 2 MB or 300 files |
| `POST /tasks/{id}/proposals` | Submits the change; Farbaek re-checks it and creates the proposal |
| `POST /model` | One model step through the model gateway (task with an approved contract, effort, conversation); metered from the workspace's AI usage |
| `POST /unpair` | Revokes the calling agent |

Requests are rate-limited per agent (120 a minute; 10 proposals and 30 model steps a minute; the lease's hourly limit) and pairing per client and globally.

Every request but `/pair` and `/unpair` checks the lease. The answers when it refuses:

| Status and code | When |
| --- | --- |
| `403 LEASE_EXPIRED` | The lease has ended. Only `/unpair` still works. |
| `403 OUTSIDE_LEASE` | The lease doesn't allow this (proposing, the model or Mesh). |
| `403 FORBIDDEN` | The task's project isn't in the lease. Such tasks are also left out of `GET /tasks`. |
| `429 LEASE_LIMIT` | The agent used its requests for this hour. Mesh's relay isn't counted. |

## Checking it

```bash
pnpm agent:smoke
```

Runs the whole platform path against a running server with a scripted stand-in for the model (no model is called). It needs `FARBAEK_SMOKE_BASE_URL` and a fresh `FARBAEK_AGENT_PAIRING_CODE`; see `tests/smoke/agent.smoke.test.ts`.

## Where things live

| Path | What |
| --- | --- |
| `src/core/agent/` | Modes, tool registry, permission engine, command risk, run states, path rules, setup report |
| `src/agent-runtime/` | Folder guard, command broker, workspace (patch or disk, checkpoints), loop, model adapters, Farbaek API client |
| `src/server/agent/`, `src/app/api/v1/agent/` | The agent API, and the model gateway (`gateway.ts`) |
| `src/core/agent/routing.ts` | Auto routing: the model for each plan and effort |
| `supabase/migrations/20261018150000_agents.sql` | Agents, pairing codes, agent proposals |
| `src/agent-runtime/mesh/` | Nearby: Noise XX (`noise.ts`), framing, the secure channel, discovery, device identity, packing, sending, receiving, `MeshNode` |
| `src/core/mesh/` | The Capsule format and checks, and the `farbaek-mesh/1` messages and limits |
| `desktop/` | The Electron app: main process, preload bridge, window, build and installer config |
