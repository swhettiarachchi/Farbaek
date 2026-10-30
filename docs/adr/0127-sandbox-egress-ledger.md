# ADR 0127: The Sandbox Egress Ledger

- Status: accepted (2026-10-30).
- From master spec §25 "Sandbox Egress Ledger": "a per-run record of the domains contacted (allowed or blocked) included in the ProofPack, using provider egress controls where available (for example Vercel Sandbox's network policies) or a proxy. Acceptance: blocked domains appear in the ProofPack; no unlisted egress succeeds in deny-all mode." The spec audit of 2026-10-30 listed it as not built.

## Context

**Enforcement already exists**, outside the sandbox: the provider's firewall applies Farbaek's rules (`src/core/sandbox/network.ts`). A session gets deny-all, or the package registries and font hosts with private ranges denied. That's what makes "no unlisted egress succeeds in deny-all mode" true.

**What's missing is the record.** The Vercel Sandbox SDK (3.5.1) reports only byte totals (`networkTransfer`, `totalEgressBytes`), never which hosts a sandbox asked for, and E2B is no different. So the spec's second route, a proxy, is the only way.

## Decision

**A small observing proxy runs inside each sandbox** (`EGRESS_SCRIPT` in `src/core/sandbox/egress-ledger.ts`):
- Node with no dependencies, written into the sandbox the same way as the preview relay (ADR 0023);
- listens on `127.0.0.1:3998` only;
- handles `CONNECT` for https and absolute-form http;
- allows a host only when it's on the session's own allowlist and the port is 80 or 443, and refuses everything else with 403. It never allows more than the firewall does; it's a second refusal, not a new door;
- appends one JSON line per attempt (time, host, port, allowed or blocked) to `/tmp/farbaek/egress.log`, up to 1 MB.

**Before each command**, the runtime runs a prelude in the same shell (`ExecRequest.prelude`, placed by `wrapCommand`). The prelude:
- starts the proxy if nothing is listening;
- empties the log, so the record is this command's (a session runs one command at a time);
- exports `HTTP(S)_PROXY`, `http(s)_proxy`, `NO_PROXY` and `NODE_USE_ENV_PROXY=1`, but only once the port answers. If the proxy can't start, the command runs exactly as before.

The stored command stays the one the person typed.

**After each command**, Farbaek reads the last 256 KB of the log through the same runtime:
- every line is checked as untrusted: a plain host name or address, a port and a decision, or else it's counted as unreadable and never shown;
- the lines are grouped by address (at most 50 allowed and 50 blocked, marked when more were cut);
- the result is stored once with the command, through `app_record_sandbox_egress` (migration v78, service_role only, refused a second time).

**In the ProofPack:**
- When checks verify a change, their records are merged into the verification ProofPack as `predicate.egress` (`observedBy: "farbaek-proxy-in-sandbox"`, with the allowed and blocked lists), with a limits line saying how it was recorded.
- `/verify` shows "Network reached" and "Network blocked".
- The sandbox console shows each command's addresses, with blocked ones in words, not colour alone.

**A kill switch:** `SANDBOX_EGRESS_LEDGER=off` stops the proxy and the record for the whole server.

## What it doesn't do

Said in the ProofPack's limits line, here, and on `/verify`:
- **It's a record of what was asked, made inside the sandbox.** Code that runs there could avoid the proxy or change its file. The firewall outside the sandbox is still what blocks, whether or not the record is complete.
- **Connections that don't use the proxy settings aren't listed.** Examples are a program that ignores `HTTPS_PROXY`, or Node older than 24 for `fetch`. The firewall still decides those.
- **A background process started by an earlier command is recorded against the command that's running.**

## Consequences

- A verified change now carries the addresses its checks reached and the ones that were refused, so "this change tried to call evil.example" is visible in its evidence.
- Each command costs one more round trip to read the record, and the first command in a session starts the proxy (about 100 ms).
- A provider that records connections itself, outside the VM, could replace the proxy later as a stronger source. The predicate's `observedBy` says which source a record came from.
