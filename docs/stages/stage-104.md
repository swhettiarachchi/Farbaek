# Stage 104: The Sandbox Egress Ledger

The spec's Sandbox Egress Ledger: a per-run record of the addresses a sandbox asked for, allowed or blocked, in the ProofPack. The provider's firewall already enforced egress; it didn't say what was asked for.

- **Decision record:** `docs/adr/0127-sandbox-egress-ledger.md`.
- **Branch:** `feat/sandbox-egress` (from `feat/github-prs`, PR #132).
- **Migration:** v78, `supabase/migrations/20261219090000_sandbox_egress.sql`.

## 2026-10-30

### Done

- **`src/core/sandbox/egress-ledger.ts`:**
  - the observing proxy (Node, `127.0.0.1:3998`, the session's allowlist, ports 80 and 443);
  - the prelude before each command;
  - the strict parser for its log;
  - grouping and merging;
  - the honesty text.
- **`ExecRequest.prelude`**, placed by `wrapCommand` in both runtimes, so the stored command stays the person's own.
- **The sandbox service:**
  - each command runs with the prelude; afterwards its record is read, checked and stored with the command (`app_record_sandbox_egress`);
  - check runs merge their records into the verification ProofPack (`predicate.egress`, plus a limits line);
  - `SANDBOX_EGRESS_LEDGER=off` turns all of it off.
- **Where it shows:**
  - the API and SDK `Execution` gain `egress`;
  - the sandbox console shows each command's reached and blocked addresses;
  - `/verify` shows "Network reached" and "Network blocked".

### Verified

- `src/core/sandbox/egress-ledger.test.ts` (8):
  - the prelude exports the proxy settings only after the port answers, empties the log, quotes the list, and passes `bash -n`;
  - the parser on hostile lines (bad JSON, odd hosts, ports and decisions, a line cut by the tail);
  - grouping, merging and the 50-address cap;
  - **the real proxy script run in Node:** it refuses unlisted hosts and ports with 403 and records them, and passes a listed address through to a local target.
- `src/server/sandbox/service.test.ts` (4 new):
  - the prelude carries the session's own list, and the stored command is unchanged;
  - the record is stored grouped, and unreadable lines are counted;
  - the kill switch;
  - the verification ProofPack names the blocked address.
- `src/core/proof/inspect.test.ts` (1 new): `/verify` names what was reached and blocked; a ProofPack without a record says nothing.
- `tests/db/sandbox-egress.test.ts` (3): the shape and once-only rules, the 64 KB cap, members read it, and only the server writes.
- `pnpm typecheck`, `pnpm lint`.

### Not verified

- **A real Vercel sandbox:** whether the proxy keeps running between commands there, and what `npm` and `curl` record. To check after the merge, run a session with `npm view react version` and `curl https://example.com`.
- **The console's network line in a browser:** the demo workspace has no sandbox commands to show.
