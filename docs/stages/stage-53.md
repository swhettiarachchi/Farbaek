# Stage 53: Shadow mode

The spec's Stage 3 lists shadow mode. The plan catalog showed it as "coming" on Pro.

- **Decision record:** `docs/adr/0075-shadow-mode.md`.
- **Branch:** `feat/shadow-mode`, on top of `feat/github-import` (stages 51 and 52, PR #65).

## 2026-10-25

### Done

- **Policy:** autonomy limits can be a rehearsal. The decision stays level 0's and gains a `shadow` verdict with reason codes. `policyRecord` stores it from all three proposal paths.
- **`src/core/trust/rehearsal.ts`:** the record. What level 2 would have done, against what really happened, with a verdict that leads with a failed check, then a discarded change.
- **Migration v46** (`20261117090000_shadow_mode.sql`):
  - `org_autonomy.shadow_since`, level 0 only;
  - `app_set_autonomy` with `p_shadow`, defaulting to false;
  - the proposal trigger drops a rehearsal outside a rehearsal, never the proposal.
  - **Applied in production** and read back: column, constraint, the 6-argument function only, the helper, and grants (server yes, browsers no).
- **Settings > Autonomy:** "Rehearse level 2 first" (dashed, Simulated badge) with the same limits. Not offered below Pro, with the reason. The rehearsal record shows underneath while rehearsing.
- **Proposal review:** the rehearsal verdict, dashed and marked "Simulated", under the real policy decision.
- **Pricing:** shadow mode is live in the catalog.

### Verified

- `src/core/trust/policy.test.ts`: 5 new tests. Would apply, every unmet limit named, escalate and block left alone, same policy version, stored only in shadow mode.
- `src/core/trust/rehearsal.test.ts` (6): counts, outcomes, reasons, and each verdict, with a failed check outranking a discard.
- `src/server/workspace/autonomy.test.ts` (3): rehearsal limits, the plan gate (trial yes, Free no, turning off needs no plan), never at level 2, owners and admins only.
- `src/components/app/rehearsal-record.test.ts` (3): marked simulated, outcomes against verdicts, the link to a failed change.
- `tests/db/shadow-mode.test.ts` (6): the switch (roles, level 0 only, keeps its start, audited), 5-argument calls still work, closed to browsers, rehearsals kept, dropped late (never the proposal), never with a change applied on its own. `tests/db/autonomy.test.ts` still passes.
- `pnpm typecheck` and lint are clean.
- Demo build: Settings > Autonomy at 1280 and 375 px, with no sideways scroll and no console errors. `pnpm qa:a11y` on `/app/settings` and `/pricing`: 4 page views, 0 findings.

### Next

Future-State Arena (the rest of the Stage 3 gap).
