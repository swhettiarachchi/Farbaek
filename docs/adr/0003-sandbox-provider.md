# 0003. Execution sandbox

- Status: proposed (owner decision needed)
- Date: 2026-10-13

## Decision so far

- A provider-agnostic `SandboxProvider` interface, with capability detection.
- First real adapter: a microVM-class provider, **E2B or Vercel Sandbox**. The owner picks after a cost review (the spec quotes per-second E2B pricing and active-CPU plus wall-clock memory pricing for Vercel; re-verify both before choosing).
- `LocalDesktopRunner` for the desktop companion, labelled "not a security sandbox" unless OS isolation is verified.
- `MockSandbox` for tests only.

## Until a provider is connected

Execution is not offered. Studio runs in **Review Only**: plans, patches and diffs, no project code execution. A normal child process is never presented as a sandbox.
