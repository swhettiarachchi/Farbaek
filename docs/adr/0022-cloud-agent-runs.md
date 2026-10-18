# 0022. Cloud agent runs: the Farbaek Agent on Farbaek's servers

- Status: accepted
- Date: 2026-10-18
- Builds on: ADR 0018 (the agent runtime), ADR 0021 (model gateway and Auto routing), ADR 0013 and ADR 0016 (sandboxes)

## Context

People should be able to build inside Farbaek, the way they would in Claude Code or Antigravity, without installing anything. The desktop agent (ADR 0018) already has a tested loop, folder guard, workspace and permission engine. The model gateway (ADR 0021) meters model steps from the wallet, and sandbox sessions (ADR 0013, ADR 0016) run commands in isolated microVMs.

## Decision

- **A cloud run** starts from a task whose contract is approved (`/app/build`, or "Build with the agent" on the task page), with an effort (ADR 0021).
- **It runs in the server process.** The server copies the project into a private working folder and runs the same agent loop as the desktop app.
  - Every tool call passes the registry and the permission engine.
  - Model steps go through `callModel` (the gateway's rules) for the person who started the run, metered from the wallet.
- **Commands run in a sandbox session**, created as that person through the sandbox service, so its guard, limits, receipts and time accounting apply.
  - Before each command, the files the agent changed are copied into the sandbox.
  - The mode is Sandboxed Autopilot: tests and builds run on their own; installs, network and anything else wait for the person, bound to the exact command.
  - With no verified sandbox, the run prepares the change without running anything ("review only"), and the page says so.
- **People follow it live.**
  - Steps, commands, notes and approval requests are appended to `agent_run_events` (migration 16): bounded to 16 KB each, at most 50 per write, written about once a second.
  - The page polls them through Row Level Security. Polling was chosen over server-sent events because it works across server instances and through proxies.
  - Only the person who started a run, or an owner or admin, can answer its approvals or stop it.
- **Lifetime.**
  - A run lasts at most 40 minutes and reports at least every minute.
  - It survives the page closing, not a server restart. A live run that stops reporting for three minutes is marked interrupted when someone looks at it, and is never resumed silently.
  - One live run per task, enforced by a unique index.
- **The result.** The finished change goes through the same checks as a desktop agent's (`prepareAgentProposal`: paths, screening, base revisions, contract, policy, evaluation allowance). It is created by `app_create_run_proposal`, which tags the proposal with the run. From there it's an ordinary proposal: review, apply, verify, ProofPack, recovery.
- **The person's credentials.** The run outlives its request, so sandbox calls use the person's access token, refreshed when the run starts and kept in memory only. Runs, the wallet and proposals use service-role functions that re-check the person in the database.

## Consequences

- Building needs nothing installed and no API key; the desktop agent stays the choice for work on a person's own machine.
- Cloud runs need a long-running Node host. On serverless hosting a run would be cut off at the function time limit. Until the owner provides hosting, runs work on a self-hosted `pnpm start`.
- A run's working folder lives on the server's disk for at most 40 minutes and is deleted when the run ends.
- Agent work on Farbaek's servers is bounded by the same limits as the desktop app (40 model steps, 3,000,000 tokens), the wallet, the plan's sandbox minutes and the gateway's rate limit.
