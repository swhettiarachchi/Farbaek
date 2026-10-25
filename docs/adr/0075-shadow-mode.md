# ADR 0075: Shadow mode, rehearsing autonomy level 2

- Status: accepted (2026-10-25).
- Builds on ADR 0046 (autonomy level 2) and ADR 0004 (the policy engine).
- Spec: "Shadow mode: record what the agent proposes and what policy would decide, with no supported side effects. Observed, proposed and simulated events are clearly distinguished from real executions." A Pro feature in the plan catalog, until now "coming".

## Context

Level 2 lets small, checked changes apply on their own. Before ADR 0075, an owner's only way to learn how it would behave in their workspace was to turn it on. If a change it applied then failed its checks, autonomy paused itself, but the change had already been applied.

## Decision

**A third setting between level 0 and level 2: "Rehearse level 2 first".** Owners and admins choose it on Settings > Autonomy, with the same limits as level 2: file count and new files. It's included in Pro and up, and in the trial.

**The policy (`src/core/trust/policy.ts`)** receives the limits marked as a rehearsal:
- It decides exactly as at level 0, so every change waits for a person.
- It adds a `shadow` decision: whether level 2 would have applied the change, or would still have waited, with reason codes (`blocked`, `escalated`, `too_many_files`, `creates_files`, `not_verifiable`) and a sentence.
- The rule set doesn't change, so neither does the policy version.

**Stored with the proposal.** The rehearsal goes inside the proposal's existing policy record, under `shadow`, written by all three proposal paths through `policyRecord`. Desktop agent proposals are never rehearsed, since level 2 never applies them.

**The database (migration v46):**
- `org_autonomy.shadow_since`, allowed only at level 0. Choosing the rehearsal again keeps its start, and turning level 2 on ends it.
- `app_set_autonomy` gains `p_shadow` (default false), so earlier calls still work. Every change is audited.
- The proposal trigger drops a `shadow` record when the workspace isn't rehearsing, or when the change applies on its own. It drops the rehearsal, never the proposal, so turning the rehearsal off mid-run loses nothing.

**Marked as simulated everywhere:**
- The review shows "Rehearsal: level 2 would have applied this on its own" (or "would have waited") with a dashed border, a flask icon and the word "Simulated", next to the real policy decision.
- Settings shows the rehearsal record (`src/core/trust/rehearsal.ts`): changes since the rehearsal began, how many level 2 would have applied, and what really happened to those (passed their checks, failed, discarded by a person, not checked, still waiting). It also shows why the others would have waited.

**The record leads with what matters most:**
1. A change level 2 would have applied that failed its checks: "Level 2 would have paused itself".
2. One a person discarded.
3. Otherwise, that none failed and none was discarded.

It links to the change to look at.

## Consequences

- Owners judge level 2 on their own workspace's evidence before trusting it, at no risk: nothing applies on its own while rehearsing.
- One more key in the stored policy record; existing proposals and readers are unaffected. A rehearsal that can't be read is left out rather than hiding its proposal.
- The Policy Builder (natural language to policy) stays "coming".
