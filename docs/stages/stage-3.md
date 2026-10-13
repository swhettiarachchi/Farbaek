# Stage 3: Trust and RealityLoop (started)

## 2026-10-13: policy engine v1 and governed-evaluation metering

### Done

- `src/core/trust/policy.ts` (ADR 0004): a versioned, hashed rule set for change proposals at autonomy level 0. BLOCK on contract violations. ESCALATE (owner or admin) for dependencies, CI, migrations, infrastructure, auth and security code, and changes to more than 10 files. Otherwise REQUIRE_APPROVAL. Path rules match whole name parts, so `docs/authoring.md` isn't treated as auth code.
- Migration `20261015180000_policy_and_metering.sql` (tested; **applied to the hosted project 2026-10-13**): `change_proposals.policy`; `app_create_proposal` takes the decision and the metering inputs, records one governed evaluation per proposal under a lock on the organization, refuses once the allowance is used up (EVALUATION_LIMIT), and insists contract violations are blocked; `app_apply_proposal` refuses escalated proposals for non-managers (APPROVER_ROLE_REQUIRED).
- `proposeChange` evaluates the policy, checks the evaluation allowance before spending any AI credits, and stores the decision. `applyProposal` enforces escalation too. The review shows the policy outcome, its findings and the rule-set hash. Approve is off for non-managers on escalated changes, with the reason.
- The demo proposal carries a real policy decision.
- Mission Control's governed-evaluations meter now counts real proposal evaluations.

### Verified

- 409 tests (30 files): 15 policy tests, 4 new database tests (decision stored, one evaluation counted, refused at the limit with nothing created, violations must block, only owners and admins apply escalated changes), and 3 new use-case tests. Typecheck, lint and build pass.
- Migration 7 on the hosted project: the SQL Editor contents matched the tested file (10,202 bytes, `sha256 d99c052c…aa05`). Supabase warned about the `drop function` line, which replaces `app_create_proposal` in the same transaction; no table or data is dropped. Confirmed, result: success. Read-only check: one `app_create_proposal` (17 arguments) and `app_apply_proposal`, both service-role-only security definer; the `policy` column exists; the escalation and metering checks are in the function bodies.
- RPC parameter names in `supabase-writer.ts` match all SQL signatures (scripted cross-check).
- All seven migrations are on the hosted project:
  `supabase migration repair --status applied 20261013120000 20261014090000 20261014120000 20261015090000 20261015120000 20261015150000 20261015180000`

### Next

ProofPack (in-toto statement) for applied changes, leases on approvals, shadow mode and scope drift. Real verification still waits for a sandbox provider (ADR 0003).
