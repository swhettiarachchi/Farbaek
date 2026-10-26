# Stage 70: Mesh's secure relay

Spec §11, "Direct Remote" and the "Optional Secure Relay". Until now, two paired Farbaek Agents could send each other folders only on the same network (ADR 0038). This was the last **Not started** item that didn't need the owner. It's built on Farbaek's own server with no new service, as the owner asked.

- **Decision record:** `docs/adr/0094-mesh-relay.md`.
- **Branch:** `feat/mesh-relay`, from `main`.

## 2026-10-26

### Done

**Before the relay: security.txt.** A static `public/.well-known/security.txt` from 2026-10-22 shadowed the route added in #82. Production served an older Expires and no Canonical or Policy lines. The static copy is removed, and the threat model's stale line is corrected.

**Database: migration v60** (`20261201090000_mesh_relay.sql`).
- `agents.mesh_fingerprint` and `mesh_reachable_at`, set only by `app_agent_set_mesh_relay`, which audits each change.
- `mesh_relay_days`: each workspace's relayed bytes per day, readable by members, and kept for 30 days.
- `app_mesh_relay_use` counts against the cap under a lock.
- `app_mesh_relay_session_ended` records one audit event per session.
- Everything is service role only.

**Server.**
- `src/server/mesh/relay-hub.ts`: reachability, calls and sessions in memory.
  - Each direction is a byte stream with offsets: retried writes are kept once, gaps are refused, and what's read is dropped.
  - Limits: 8 MiB per direction, 2 MiB per write, 3 sessions per workspace and 20 in all, 5 waiting calls, call, quiet and idle timeouts, 6 hours at most, and 5 GB a day counted in the database.
- `relay-http.ts`: one hub per process, its database calls, and `withRelayAgent`, which uses the agent token in a `relay` bucket of 600 a minute and refuses an agent whose person left.
- **Routes:**
  - `/api/v1/agent/relay/presence` (POST and GET);
  - `calls`;
  - `sessions/[id]/join`;
  - `sessions/[id]/data` (POST and GET);
  - `sessions/[id]` (DELETE).
- `withAgent` takes an optional rate-limit bucket.

**Agent runtime.**
- `relay.ts`: `RelayClient` and `RelayStream`, a Duplex over a session.
  - Writes go in batches of up to 2 MiB, each at its offset.
  - Reads are long polls that acknowledge what arrived.
  - It retries with backoff for up to a minute.
- `framing.ts` and `channel.ts` take any duplex stream. The relay handshake waits up to 30 seconds.
- **`MeshNode`:**
  - `setReachable(on)` is the consent. While on, it polls for calls and answers only paired devices.
  - A relayed call asking to pair is closed.
  - `sendThroughRelay` is only used when the person chooses it.
  - The snapshot gains `relay` and each transfer's `via`.
- `OutgoingTransfer` takes its own words for an unreachable computer.

**Desktop app.**
- Main builds a `RelayClient` from the stored pairing and token, with the reason when the app isn't paired.
- New IPC: `mesh:reachable` and `mesh:send-relay`.
- **Nearby screen:**
  - a "Through Farbaek" card with what it means and the switch;
  - "Send through Farbaek", visibly unavailable with its reason;
  - "Through Farbaek, encrypted end to end" on relayed transfers;
  - the intro no longer says nothing ever passes through Farbaek.

**Web.**
- The Mesh page's devices card shows which agents turned the relay on, whether each is reachable now, and today's share of the relay allowance.
- The privacy page says what the relay carries and records.
- `docs/agent/README.md` explains the steps.

**Security.** SE-031, "A relay that could read or redirect a transfer", and a threat model section.

### Verified

- `pnpm typecheck` and `pnpm lint`: clean.
- **Full suite:** 1,880 passed, 17 skipped.

  | New tests | Count |
  | --- | --- |
  | `relay-hub.test.ts` | 8 |
  | `relay.test.ts` (including lost requests and lost answers) | 4 |
  | `mesh.test.ts` "through Farbaek's relay" | 5 |
  | `tests/db/mesh-relay.test.ts` | 3 |

  The `mesh.test.ts` cases cover:
  - a 10 MB folder delivered and checked, with none of its text or bytes readable in what the relay carried;
  - an impostor refused;
  - no pairing through the relay;
  - unreachable, then delivered.
- **`pnpm security:eval`:** 31 scenarios, 31 passed.

### Not verified

- Two real computers on different networks. That needs two agents paired with the owner's workspace.
