# ADR 0122: Reversibility Radar and the Cost Brain on each task

- Status: accepted (2026-10-30).
- Implements two parts of master spec §10 ("Developer intelligence") that the spec audit of 2026-10-30 found missing:
  - **Reversibility Radar:** "Classify schema and data changes, public APIs, destructive operations, dependency swaps, configuration and integrations as rollback-supported, requires backup, forward-fix required, compensating action available, reversibility unknown. Always state the basis and the limits."
  - **Developer Cost Brain:** "Track actual AI tokens and cost where providers report them, retry and repair cycles, CI and test time, and sandbox cost. Label estimates."

## Decision

### Reversibility Radar

**Where:** on every change's review, beside the second check (`src/core/insights/reversibility.ts`).

**How each file is classed:** deterministic rules on the file's path and the lines the change adds. Nothing is run, and nothing is inferred past those.

| Area | Recognised by | Class |
| --- | --- | --- |
| Migration that removes or rewrites data | a migration path, with added `drop`, `delete from`, `truncate`, `alter table … drop/rename` or `update … set` | Requires a backup |
| Other migration | `migrations/`, `migrate/`, `db/schema/`, `.sql` | Forward fix required |
| Dependencies | package manifests and lockfiles across ecosystems | Compensating action available (reinstall) |
| CI, build or deploy settings | workflows, Dockerfiles, compose, Vercel, Netlify, Fly, Render, Wrangler, Terraform, Kubernetes | Compensating action available (run or deploy again) |
| Public API | `app/api`, `pages/api`, OpenAPI, Swagger, GraphQL | Reversibility unknown (outside callers) |
| Talks to another service | added code naming payments, email, webhooks, or fetching an outside address | Reversibility unknown (what was sent can't be called back) |
| Anything else | | Rollback supported (Farbaek's Undo) |

**Reading a result:**
- Each file shows its class, its area, the basis and what Undo can't do.
- The change as a whole takes its hardest file's class.
- Rollback is honest about its own limit: Undo works only while the file still holds what was applied.
- The card says nothing was run. Farbaek never runs a recovery on its own.

### Developer Cost Brain

**Where:** a **What this task has used** panel on every task (`src/core/insights/cost-brain.ts`).

**What it shows:**
- AI usage by operation: calls, the share of a period's allowance, tokens as each provider reported them (in, out, cached), and the models used.
- What was given back: failed calls, free retries and stopped runs. These are the retry and repair cycles, and they aren't counted.
- Sandbox sessions and the minutes counted while they ran, and how many are still open.

**Honest units:**
- Shares, never internal units, as everywhere in Farbaek.
- A reservation not yet settled is labelled an estimate.
- A task can run across months, so its share is "of a month's AI usage on this plan" (or "of the trial's"), not "of this month's".

**Data:** the usage ledger and sandbox sessions, read through the person's session under the existing row security. No migration and no new grant.

## Not done

- **CI and test time outside Farbaek's sandbox:** there's no CI connection yet.
- **Dollar costs:** Farbaek shows shares, by design (ADR 0019).
- **Radar rules for a project's own conventions** (custom migration folders): the radar says "Rollback supported" for paths it doesn't recognise, with Undo's limits stated.
- **The Architecture Why-Graph and the Failure Futures Lab:** next stages.
