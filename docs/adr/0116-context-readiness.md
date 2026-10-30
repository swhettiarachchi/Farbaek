# ADR 0116: Context Readiness and the Context Passport

- Status: accepted (2026-10-30).
- Implements master spec §8 ("Context Readiness Engine and Context Passport"), which the spec audit of 2026-10-30 (`docs/architecture/spec-audit-2026-10-30.md`) found missing. Until then, the homepage claimed it.
- Builds on ADR 0047 (verification), ADR 0021 (the agent gateway) and the Setup Report (spec §7).

## Context

A task's `CONTEXT_ASSEMBLED` state was only a label: the task moved past it without anything being assembled. The plan drafter saw only file paths, and the agent saw the contract and a file list. Neither knew:
- whether the commands under the plan's checks exist;
- whether files changed after the plan was approved or after the last checks;
- whether the project's own documents contradict each other;
- what Farbaek can't see.

So runs failed on things that could be known before they started, and the AI sometimes treated a guess as a fact.

## Decision

**A pure domain module** (`src/core/realityloop/context-passport.ts`) turns the project's real records into facts. Each fact has one status and its sources:

| Status | Meaning | Examples |
| --- | --- | --- |
| verified_current | Read from a current file or record | the runtime from package.json; a check whose script exists; the last checks with no change since |
| possibly_stale | True when recorded, but something it depends on changed | files in the plan's scope changed after approval; files changed after the last checks |
| conflicting | Two sources disagree; Farbaek doesn't pick | two framework configs; README commands package.json doesn't define |
| inferred | Written by a person or the AI, not confirmed | an unapproved plan; the plan's open questions; paths the plan may create |
| missing | Needed and absent | no plan; a check whose script doesn't exist; no lockfile; no files |
| unavailable | Exists but Farbaek can't see it | environment variable values; images as text |

**Readiness:**
- **Not ready:** with no plan, or when the plan names paths that don't exist and it may not create files.
- **Ready, with things to check:** when anything isn't verified.
- **Ready:** otherwise.

It advises; it doesn't block. A task whose job is to add the missing test script must still be able to run.

**The Context Passport** is the same assembly as a portable JSON record (`farbaek.context-passport/v1`):
- goal, facts, sources, constraints, open questions, assumptions, conflicts, plan reference, freshness conditions and next steps;
- sources are paths, hashes and revisions, never file contents or secret values;
- downloadable at `/app/tasks/:id/passport`, read through the person's own session (Row Level Security).

**Where it's used:**
- **The task page:** a Context readiness card while the task's work is ahead of it, with the readiness, counts by status, each fact with its icon, label and file reference, and the next steps.
- **The plan drafter:** the brief carries up to 30 facts. The prompt says to put a command under checks only if a fact shows the project has it, and to record anything not verified as an assumption or open question.
- **The agent:** the opening message carries up to 30 facts. The system prompt says to rely on verified_current facts and to check the rest before depending on them.

Only package.json, README.md and `.env.example`-style files are read as text, and only for scripts and variable names.

## Consequences

- **Cost:** a few hundred extra prompt tokens per draft and run. They're counted in the usage reservation, since the brief is measured whole.
- **Not covered yet:** issues, pull requests and ADRs inside the person's project, and per-fact freshness windows by time (only by change). These need repository integrations that Farbaek doesn't have yet.
- **Mesh:** a passport can later travel in a Mesh Capsule for the desktop handoff (spec §25); its format is ready for that.
