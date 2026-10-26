# ADR 0095: Direct links over the internet, with Farbaek's own STUN server

- Status: accepted (2026-10-26).
- Spec §11, "Direct Remote: P2P (WebRTC data channels …), with signaling separated from data. Explain how NAT, firewalls and platform limits can block it."
- Builds on ADR 0038 (nearby transfer) and ADR 0094 (the relay).

## Context

Since ADR 0094, paired Farbaek Agents on different networks can send folders through Farbaek's relay. Every byte then crosses the VPS, counts against 5 GB a day, and moves at the speed of HTTPS round trips through one server. The owner asked for direct links between computers, without paying for outside services.

A direct link across two home or office routers needs three things:
- **Each computer's public address,** which a STUN server tells it.
- **A way to exchange connection details,** which is signaling.
- **A transport that punches through the NATs and is reliable and encrypted:** WebRTC's ICE, DTLS and SCTP.

The usual answer pairs Google's public STUN servers with a paid TURN service.

## Decision

**A STUN server of Farbaek's own.**
- `deploy/vps/stun/stun-server.mjs` uses only Node's `dgram` and `zlib`. It answers RFC 5389 Binding requests with XOR-MAPPED-ADDRESS and FINGERPRINT, and is checked against RFC 5769's sample vectors.
- **It ignores everything else.** It answers each address at most 30 times in 10 seconds, with at most 52 bytes, so it's useless for amplifying traffic at someone.
- **It runs in its own container** on the VPS: the app's Node image, the `node` user, read-only, no capabilities, its own network, UDP 3478. It keeps no record of who asked.
- `scripts/ops/stun-check.mjs` asks it from any computer.

**Signaling over the relay.** The offer, answer and candidates travel as checked lines of JSON over a relay session (`direct-signal.ts`), with the call marked `direct`. So they get the relay's guarantees:
- the agent token;
- calls only inside the workspace;
- consent through "Be reachable over the internet";
- the daily allowance, for the few kilobytes involved.

The session closes as soon as the data channel opens.

**Chromium's WebRTC in a hidden window.** Electron already ships it, so there's no dependency and no hand-written transport.
- A sandboxed, context-isolated window, with no Node and a page that loads nothing, holds the peer connections. Its preload (`desktop/src/rtc`) is the only code that touches them.
- The main process talks to it over a MessagePort per link, with backpressure: 8 MiB in flight from the main process, and a 4 MiB data channel buffer.
- The main process turns the open channel into a stream (`desktop/src/main/direct.ts`).
- The ICE servers are Farbaek's STUN only.

**Noise on top, unchanged.** The same handshake, offer, BLAKE3 checks, resume and verified report as nearby run over the data channel.
- The server relays the SDP, so in principle it could swap the DTLS fingerprints and stand in the middle.
- Noise XX proves end to end that the other side holds the key its person paired on a shared network. A swapped link fails before anything is offered ("isn't the Laptop you paired with").

**No TURN.** A TURN server is a relay. Farbaek already has one, which passes only Noise ciphertext and needs consent. When a direct link can't open within 20 seconds, the transfer stops and explains why: symmetric NATs, phone hotspots and many offices block direct links. It then offers **Send through Farbaek instead**. It never switches by itself, as the spec requires.

**What each party learns.**
- **The server:** the setup messages, which include both computers' network addresses, and that a link was made. Never the files.
- **The two computers:** each other's public and local addresses. They're paired devices of the same person or workspace.

## Consequences

- Transfers between computers on different networks go at the speed of the two connections when the networks allow it, cost the VPS nothing beyond setup, and keep the files off the server entirely.
- UDP 3478 is open on the VPS. The port is published by Docker, which bypasses ufw. If Hostinger's panel firewall filters traffic, it must allow UDP 3478.
- **Checked live:** two real agent windows on one computer. Through a local relay and the STUN server, Chromium opened a data channel, a 2.9 MB folder was delivered and checked with an identical SHA-256, and the relay carried 2,438 bytes of setup and no file content.
- **Still to check:** two computers behind different real NATs, and the production STUN answering from the internet once deployed.
- **Not built:** phones, which need the mobile apps, and IPv6-only paths beyond what Chromium's ICE does by itself.
