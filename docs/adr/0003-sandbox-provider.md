# 0003. Execution sandbox

- Status: accepted; the provider choice is made in ADR 0013 (E2B behind a Farbaek-owned runtime interface, self-hosted E2B Embed as the target)
- Date: 2026-10-13

## Decision so far

- A provider-agnostic `SandboxProvider` interface, with capability detection.
- First real adapter: a microVM-class provider, **E2B or Vercel Sandbox**. The owner picks after a cost review (the spec quotes per-second E2B pricing and active-CPU plus wall-clock memory pricing for Vercel; re-verify both before choosing).
- `LocalDesktopRunner` for the desktop companion, labelled "not a security sandbox" unless OS isolation is verified.
- `MockSandbox` for tests only.

## Implemented (2026-10-13)

- `src/core/execution/sandbox.ts`: the `SandboxProvider` interface, capabilities, and `executionMode`. It runs sandboxed only with verified microVM isolation and egress that isn't open; anything else is Review Only, with a reason. `verificationEvent` turns real exit codes into the lifecycle event the state machine's guards allow, or no event when none is honest yet.
- `src/server/execution/sandbox.ts`: no adapter is installed, so every environment reports Review Only. Setting `SANDBOX_PROVIDER` without an adapter says exactly that.
- Settings shows the execution mode. Tasks in verification list their required checks as "Not run".

## Until a provider is connected

Execution is not offered. Studio runs in **Review Only**: plans, patches and diffs, no project code execution. A normal child process is never presented as a sandbox.
