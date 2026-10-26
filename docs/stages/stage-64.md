# Stage 64: Autonomy level 3

Spec Stage 8 "autonomy levels 3–4", and the plan catalog's "Advanced autonomy policies" (Max 3x and up), which was marked coming.

- **Decision record:** `docs/adr/0086-autonomy-level-3.md`.
- **Branch:** `feat/autonomy-level-3`, on top of `feat/plan-features`.

## 2026-10-26

### Done

**Database: migration v54.**
- `org_autonomy` gains level 3, up to 10 files at level 3, and `daily_limit` (1–50, only at level 3).
- `private.autonomy_record` and `app_autonomy_record` (as the person): changes applied on their own in 30 days, by their newest ProofPack.
- `app_set_autonomy` takes a daily limit and refuses level 3 unless it's earned (10 verified, none failed), on the way in and after a pause.
- `autonomy_allows` and the failure trigger cover level 3.
- The automatic-apply trigger refuses past the daily budget.

**Core.**
- `policy.ts`: level 3 limits, and `daily_limit` holds a change for a person once the budget is spent. Findings name the level, and the rule set describes level 3.
- `autonomy-levels.ts`: the thresholds, and the record in words.

**Server.**
- `autonomy.ts`:
  - the view gains the daily limit and the count of changes applied on their own in 24 hours; a count that can't be read spends the budget;
  - `limitsFrom` gives level 3 with what's left;
  - `readAutonomyRecord`;
  - `setWorkspaceAutonomy` checks the plan (Max 3x), up to 10 files and the daily limits.
- The action parses level 3. The errors `AUTONOMY_NOT_EARNED` and `AUTONOMY_DAILY_LIMIT` were added.

**UI.**
- Settings > Autonomy offers "Level 3: Wider, verified changes apply on their own":
  - unavailable with its reason: the plan, or the record ("Unlocks after 10 changes … So far: 3.");
  - with level 3 chosen: up to 10 files, new files, "Up to N changes a day", and "Applied on their own in the last 24 hours: n of N".
- "Level 4: Governed multi-step workflows" is shown as "Not built yet."
- `FEATURE_STATUS.advanced_autonomy` is now live.

### Verified

- `tests/db/autonomy-level-3.test.ts` (4):
  - refused until 10 verified, with the record read through RLS;
  - the limits' ranges and constraints;
  - the daily backstop;
  - a failure at level 3 pauses it, and it must be earned again while level 2 turns on at once.
- `policy.test.ts` (3 new): wider limits, the daily budget, nothing escalated lowered.
- `autonomy-levels.test.ts` (2) and `autonomy.test.ts` (2 new): plan, ranges, `limitsFrom` with what's left.
- New security scenario **SE-027**, "Autonomy beyond its budget". `pnpm security:eval`: 27 of 27.
- `pnpm typecheck` and lint are clean.
- **Demo build at 1280 and 375:**
  - "Level 3: Wider, verified changes apply on their own", with "Level 3 is included in Max 3x and up.";
  - "Level 4: Governed multi-step workflows … Not built yet.";
  - with level 3 picked: files up to 10, new files, "Up to 10 changes a day", and the daily limit among the conditions;
  - no sideways scroll, no console errors.
- `pnpm qa:a11y` on `/app/settings`: 0 findings.
- The design, workspace, component and core suites pass (910 tests). Lint is clean.
- **v54 applied in production** and read back: the constraints, the seven-argument setter closed to browsers, and the record callable signed in but not signed out.

### Not checked

- A real level 3 workspace: it needs Max 3x and a record of 10 verified automatic changes, which no workspace has while payments aren't connected.
