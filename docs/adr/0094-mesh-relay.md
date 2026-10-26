# ADR 0094: Mesh's secure relay, on Farbaek's own server

- Status: accepted (2026-10-26).
- Spec §11, "Connectivity modes": Direct Remote and the "Optional Secure Relay".
- Builds on ADR 0038 (Mesh nearby transfer), ADR 0077 (agent downloads) and the agent API (ADR 0021).
- Migration v60 (`20261201090000_mesh_relay.sql`).

## Context

Two paired Farbaek Agents can send a folder to each other only on the same local network (ADR 0038):
- a Noise XX handshake with both static keys checked against the devices the person paired;
- 4 MiB chunks, each checked against its BLAKE3 hash;
- resume after a dropped connection;
- the person accepts each folder;
- "Delivered" only once the receiver has checked every file.

The spec asks for remote transfer too. Its relay must be "only with explicit consent. Content is end-to-end encrypted so the relay can't read it, metadata is minimized, and there are expiry and resource limits. Never upload silently when a direct transfer fails."

The owner has no budget for new services. Farbaek runs on one Hostinger VPS (2 cores, 8 GB of memory, 70 GB of disk free), with its database there too. A TURN service, a storage bucket or a separate relay host would each cost money or add a third party.

## Decision

**A live relay inside Farbaek's own app, carrying the existing protocol unchanged.**

**The relay is a byte pipe, nothing more.**
- `RelayHub` (`src/server/mesh/relay-hub.ts`) keeps, in memory:
  - which agents are reachable;
  - calls waiting to be answered;
  - for each session, two byte streams with offsets.
- `RelayStream` (`src/agent-runtime/mesh/relay.ts`) makes a session look like a TCP socket to the Noise channel. So the handshake, the offer, the BLAKE3 checks, resume and the verified report all run end to end, exactly as on a network.
- **Over plain HTTPS** through the agent API (`/api/v1/agent/relay/*`, with the agent's token, in a rate-limit bucket of its own):
  - writes carry their byte offset, so a write retried after a lost answer is kept once;
  - reads are long polls whose `from` says what has arrived, so the server drops it.

  No WebSocket server and no change to Caddy or Docker.

**What the server can and can't learn.**
- **It can't read anything that moves:** every byte is Noise transport ciphertext.
- **It can't impersonate a device:** each side checks the other's static key against its own paired devices.
- **It can't make a device trusted:** a relayed call asking to pair is refused, so pairing stays on a shared network, with the code compared on both screens.
- **It does learn** which two agents of a workspace talk, when, and how many bytes pass. The database records one audit event per session with the two agents, the bytes and how it ended, plus the workspace's daily total. It never records file names or contents.

**Consent on both sides.**
- **Receiving:** the person turns on "Reachable through Farbaek". It lasts while the app is open, and only paired devices are answered.
- **Sending:** the person chooses "Send through Farbaek". A failed nearby transfer never falls back to the relay.

**Limits.** Nothing is written to disk, and a closed session's bytes are dropped within seconds.

| Limit | Value |
| --- | --- |
| Buffered per direction | 8 MiB |
| Per write | 2 MiB |
| Live sessions | 3 per workspace, 20 for the server |
| Calls waiting for an agent | 5 |
| A call nobody takes ends after | 60 seconds |
| A session ends when either agent goes quiet for | 60 seconds |
| A session ends when neither is heard for | 2 minutes |
| A session lasts at most | 6 hours |
| Relayed per workspace per day | 5 GB, counted in the database |

If the day's count can't be kept, the session closes rather than carry on uncounted.

**Why not store and forward?** A queue on the server would let the receiver be offline. But it would:
- keep encrypted files at rest on the database's disk, with their backups and retention;
- need a new one-way encryption scheme instead of the handshake already tested;
- lose the receiver's "verified" answer to the sender.

The spec's answer for an offline receiver is a local queue on the sender, which the existing Resume already gives.

## Consequences

- Paired computers anywhere can exchange folders with the same guarantees as on one network. It costs only the VPS's bandwidth, within the daily allowance.
- **Throughput** is bounded by HTTPS round trips through one server: a few megabytes a second, not a direct link's speed. Fine for projects; slow for very large media.
- **A server restart** drops live sessions. The agents show "Interrupted", and Resume carries on from the last checked chunk. Reachability is registered again on the next poll.
- **Not done:** direct peer-to-peer (WebRTC or QUIC with NAT traversal), which would need STUN and, often, TURN; phones, which need the mobile apps.
- **Untested live:** two computers on different networks. The relay is checked with two agents in one process through the real hub, including lost requests and lost answers.
