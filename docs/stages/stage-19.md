# Stage 19: Autonomy level 2, bounded execution

The spec's Stage 3 asks for autonomy levels 0 to 2. Farbaek ran only level 0. Now an owner or admin can let small, checked changes apply on their own, within limits they set; everything else still waits for a person.

- **Plan:** approved 2026-10-23.
- **Decision record:** `docs/adr/0046-autonomy-level-2.md`.
- **Branch:** `feat/autonomy-2`, from `main`.

## 2026-10-23

### Done

**Migration v31** (`20261102090000_autonomy.sql`):
- **The table** `org_autonomy`: the level (0 or 2), a file limit of 1 to 5, whether new files are allowed, and any suspension. Members read it; the server writes it.
- **`app_set_autonomy`:** owners and admins only; it clears a suspension when level 2 is turned on, and it's audited.
- **A trigger before a proposal is inserted:** refuses `ALLOW_WITHIN_LIMITS` unless level 2 is on and not suspended.
- **A trigger after a ProofPack is inserted:** a failed ProofPack for a change applied by policy suspends autonomy, with the reason, and is audited.

**Policy version 2** (`src/core/trust/policy.ts`):
- `ALLOW_WITHIN_LIMITS` only when the result would be `REQUIRE_APPROVAL` and the change:
  - is within the file limit;
  - creates no files, unless allowed;
  - has checks a verified sandbox can run;
- a finding in words either way;
- the schema is `farbaek.policy/v2`.

**Applying:**
- `applyProposal` takes `by: "policy"`: exactly the proposal's content, `grant_approval` by `system`, and a ProofPack approval with `by: "policy"`.
- `autoApplyWithinLimits` runs right after creation, in:
  - web proposals (`proposeChange`, given the workspace's autonomy and execution mode);
  - finished cloud runs (`executor.ts`), whose steps say it applied, or why it waits.
- **Excluded:** desktop-agent proposals and partial runs.

**Settings:** an Autonomy card with the two levels, level 2's conditions, the limits, the suspension notice, and a note when no verified sandbox is connected.

**The review:** applied changes say "Applied on its own … (level 2)".

### Verified

- **`tests/db/autonomy.test.ts`** (4 tests):
  - only owners and admins set it, with limits checked, audited, read by members, written only by the server;
  - `ALLOW_WITHIN_LIMITS` is refused while off or suspended, and accepted at level 2;
  - a failed check after a policy-applied change suspends it, with the reason, and is audited;
  - a failure after a person's approval doesn't;
  - turning it on again clears the suspension.
- **`policy.test.ts`** (19 tests, 4 new):
  - allowed within limits, with the finding;
  - each unmet limit named (too many files, new files, nothing to check it);
  - new files when allowed;
  - a block or an escalation is never lowered;
  - off by default;
  - the v2 schema.
- **`proposals.test.ts`** (4 new):
  - applying by policy records `system` and `by: "policy"` with exactly the proposal's content;
  - a proposal not allowed, or different content, is refused;
  - `proposeChange` applies on its own when allowed and verifiable, and waits without a sandbox.
- **`executor.test.ts`** (3 new):
  - a finished run applies on its own and notes it;
  - it waits with no sandbox or with autonomy off;
  - a failed automatic apply leaves it waiting, and says why.
- **The full suite:** `pnpm typecheck` and `pnpm lint` are clean. `pnpm test`: 1,210 passed, 14 skipped.
- **In the browser,** on a demo build:
  - Settings shows the Autonomy card with "Level 0" selected, read-only, with the demo's reason;
  - with the demo's disabled flag lifted in the browser for inspection only, choosing level 2 shows its four conditions, the file limit and "Allow new files";
  - at 404px nothing scrolls sideways;
  - at 1280px the card sits between Execution and Workspace;
  - no hydration errors.
- **Not run:** a real automatic apply. It needs a signed-in workspace with level 2 on and a verified sandbox; the paths are covered by the use-case, executor and database tests.

**Production database:** migration v31 applied to the self-hosted database on 2026-10-23.
- **How:** the SHA-256 (`d47d8dbc…c924233b3`) matched on the server; one transaction with `ON_ERROR_STOP`.
- **Read-only checks:**
  - `org_autonomy` has RLS with one read policy;
  - signed-in users can read and not write, and anonymous users can't read;
  - only the server can run `app_set_autonomy`;
  - both triggers are in place;
  - no workspace has a setting yet, so every workspace is at level 0.
- **Afterwards:** the API schema cache was reloaded.

### Next

- Run the contract's checks automatically after a change applies on its own, in the run's own sandbox.
- Levels 3 and 4, and per-project autonomy.
