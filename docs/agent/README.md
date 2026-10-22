# Farbaek Agent

A desktop app that works on a task's approved intent contract on your computer, using Farbaek's AI through the model gateway (no API key needed), and hands the finished change to Farbaek as a normal change proposal for review. Decisions: [ADR 0018](../adr/0018-farbaek-agent-runtime.md), [ADR 0021](../adr/0021-model-gateway-and-auto-routing.md).

## How it fits

1. In Farbaek, approve a task's intent contract.
2. In the app, pick the task, a mode and an effort (Fast, Balanced or Deep), and start a run. The app copies the project's files into its own folder for that run.
3. The agent works in that copy. Every tool call is validated, checked against the mode and the contract, and, when needed, approved by you.
4. You review the result in the app and submit it. Farbaek checks it again (paths, file screening, base revisions, contract, policy, evaluation allowance) and creates a proposal tagged "Proposed by Farbaek Agent".
5. From there it's the same as any proposal: per-chunk review, apply, checks on Vercel Sandbox, ProofPack, recovery.

## Modes

| Mode | Files | Commands | Where |
| --- | --- | --- | --- |
| Review Only | A patch in memory; nothing on disk changes | None | This computer |
| Controlled Development | The run's copy, with a checkpoint before each write | Read-only commands run; tests, builds, installs, network and anything destructive wait for your approval of that exact command | This computer, **not isolated** |
| Sandboxed Autopilot | Not available yet | Not available yet | Needs the agent to reach Farbaek sandboxes, which isn't built |

Writes must stay inside the contract's paths and allowed operations, and are refused if they look like they contain a secret or touch a credentials file. Installs always get `--ignore-scripts` unless you approve otherwise.

## Limits

- 40 model steps, 3,000,000 tokens and 45 minutes per run (`DEFAULT_RUN_LIMITS` in `src/agent-runtime/loop.ts`).
- Commands: 5 minutes by default, 30 at most; 64 KB of output kept per stream.
- Files: 512 KB per file read or written; 5,000 files walked; 100 search matches.

## Pairing and the model

- **Pairing:** in Farbaek, open Agents and create a code. Type it into the app with Farbaek's address. The code works once, for 10 minutes. The app gets a token that only it stores, encrypted with the system keychain; Farbaek keeps only its hash. Your plan sets how many agents can be paired.
- **The model:** each step goes to `POST /api/v1/agent/model`. Farbaek picks the model for your plan and the effort (Auto routing), calls Claude with its own key, and meters the step from the workspace's AI usage at its real token cost. Refusals and provider failures are given back. Farbaek doesn't keep the conversation; the usage ledger records the model and token counts. Versions before the gateway stored a personal key; the app now deletes it on start.
- **Revoking:** from Agents in Farbaek (owners, admins, or the person who paired it), or Settings → Unpair in the app. A revoked token stops working on the next request, and the app forgets it.
- If the system keychain isn't available (for example Linux without a running keyring), the app refuses to store anything secret.

## Nearby: folders between your computers

Nearby (Mesh phase B, ADR 0038) sends a folder straight to another computer on the same network, with no Farbaek account needed and nothing passing through Farbaek's servers.

1. **Be visible.** On the receiving computer, open Nearby and choose **Be visible**. It lasts five minutes. Windows may ask to allow Farbaek Agent on private networks the first time.
2. **Pair, once.**
   - On the sending computer, choose **Look for computers**, then **Pair**.
   - Both screens show a six-digit code. Confirm on both only if the codes match. A different code means something is between the two computers.
   - If the network hides computers from each other, use **Connect by address** with the address and port the visible computer shows.
3. **Send.** Choose a folder and see what's included and what stays behind (credentials, `.env` files, keys, dependency folders, secret-looking text; detection isn't guaranteed), then choose the paired computer.
4. **Accept.** The receiving computer shows the offer. Accept and choose where it goes: it's saved into a new folder there.

Every 4 MiB piece is checked against its BLAKE3 hash as it arrives, and the sender shows "Delivered" only after the receiver has checked every file. If the connection drops, **Resume** carries on from the last checked piece. **Forget** a paired computer to stop it sending to or receiving from this one. Nothing received is ever run.

**Checked so far:** two agents on one computer. Transfer between two physical computers on a real network is still to be checked.

To check Nearby by script, run two windows with separate scratch data folders (`FARBAEK_AGENT_DATA_DIR`) and the development-only folder overrides `FARBAEK_AGENT_TEST_SEND_FOLDER` and `FARBAEK_AGENT_TEST_SAVE_FOLDER`, which packaged builds ignore.

## Building

```bash
pnpm agent:dev
```

```bash
pnpm agent:dist
```

`agent:dev` bundles the app into `desktop/app` and opens it. `agent:dist` builds the production bundle and an unsigned NSIS installer in `desktop/release` (about 114 MB, almost all of it the Electron runtime). The window's fonts (Geist, SIL Open Font License) are downloaded once at build time; without network, the app uses system fonts.

### Not signed yet

Signing needs certificates the owner hasn't bought yet:

- **Windows:** an Authenticode code-signing certificate (an EV certificate avoids the SmartScreen reputation warm-up). Set `CSC_LINK` and `CSC_KEY_PASSWORD` before `agent:dist`.
- **macOS:** an Apple Developer ID Application certificate, plus notarization with an app-specific password or API key.

Until then, Windows SmartScreen shows "Windows protected your PC" (choose More info, then Run anyway), and macOS refuses the app unless opened with right-click → Open.

## Agent API

`/api/v1/agent`, authenticated with `Authorization: Bearer fa_…` (except pairing):

| Method and path | What it does |
| --- | --- |
| `POST /pair` | Redeems a pairing code; returns the token once |
| `GET /me` | The agent, workspace, the person's role, and whether a verified sandbox is connected |
| `GET /tasks` | Tasks whose contract is approved and that are waiting for a change |
| `GET /tasks/{id}` | The task, its approved contract and the project's file list |
| `GET /tasks/{id}/files?after=` | File contents in pages of up to 2 MB or 300 files |
| `POST /tasks/{id}/proposals` | Submits the change; Farbaek re-checks it and creates the proposal |
| `POST /model` | One model step through the model gateway (task with an approved contract, effort, conversation); metered from the workspace's AI usage |
| `POST /unpair` | Revokes the calling agent |

Requests are rate-limited per agent (120 a minute; 10 proposals and 30 model steps a minute) and pairing per client and globally.

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
