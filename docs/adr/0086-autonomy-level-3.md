# ADR 0086: Autonomy level 3, earned and bounded

- Status: accepted (2026-10-26).
- Builds on ADR 0046 (level 2), ADR 0047 (checks straight after an automatic apply), ADR 0075 (shadow mode) and ADR 0082 (workspace rules).
- Spec §9: "Level 3 — Verified workflow: execute a wider but explicit set of operations under continuous checks and limits … Organizations configure … scopes, spend ceilings … Autonomy is automatically reduced … after serious failures."

## Context

Level 2 lets small, checked changes apply on their own: at most 5 files, inside the contract, no sensitive files, checks a verified sandbox runs. A workspace with a long clean record still has to approve every change of 6 files, or every busy day's worth of small ones. The plan catalog sells "Advanced autonomy policies" on Max 3x, marked coming.

## Decision

**Level 3 is level 2 with wider limits, earned and bounded.**
- **The same rules as level 2.** The contract, the built-in policy, workspace rules and the checks all still apply. Escalated and blocked changes never apply on their own.
- **Wider:**
  - up to 10 files a change (level 2: 5);
  - new files if the workspace allows them.
- **Bounded:** a daily budget of changes applied on their own (5, 10, 20 or 50 in 24 hours).
  - **The server:** once the budget is spent, the policy holds the change for a person (reason `daily_limit`, "the workspace reached its daily limit of changes applied on their own"). A count that can't be read counts as spent.
  - **The database** (migration v54): refuses any further `ALLOW_WITHIN_LIMITS` proposal past the budget (`AUTONOMY_DAILY_LIMIT`), whichever path made it.
- **Earned.** `app_set_autonomy` turns level 3 on only after a clean record: at least 10 changes applied on their own passed their checks in the last 30 days, and none failed or only partly passed (`AUTONOMY_NOT_EARNED`).
  - It's checked on the way in, and again when turning it back on after a pause.
  - Settings shows the record in words ("So far: 3.") through `app_autonomy_record`, read as the person.
- **Reduced after a failure.** A failed or partly passed check after an automatic apply pauses autonomy, as at level 2. The failure stays in the 30-day record, so level 3 can't come back until it's earned again; level 2 can be turned on at once.
- **Plans:** Max 3x and up, checked on the server. Levels 2, 0 and the rehearsal are unchanged.

**Level 4 isn't built.** Governed multi-step workflows (agents carrying out an approved plan across several changes, with a person at set checkpoints) are shown on Settings as "Not built yet", so nobody looks for them elsewhere.

**The policy's rule set describes level 3**, so new decisions carry a new policy version.

## Consequences

- A workspace that has shown level 2 works for it can let more through, at a pace it chooses, and loses that the moment something fails.
- The replay (ADR 0081) and shadow mode stay about level 2's limits.
- Level 4 needs its own design: approved multi-step plans and checkpoints.
