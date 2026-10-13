# Stage 2: Studio vertical slice (in progress)

## 2026-10-14: intent contracts

### Done

- Migration `20261014120000_intent_contracts.sql` (tested; **applied to the hosted project 2026-10-14**, see below): `intent_contracts` with immutable versions, a SHA-256 of the RFC 8785 canonical body, and draft / approved / superseded status; RLS for members; service-role-only `app_save_contract` and `app_approve_contract`, which store the contract and apply the task transitions in one transaction. A shared `private.apply_transitions` re-checks every step against the current state and version.
- `src/core/realityloop/contract-form.ts`: turns the editor's fields into a validated `IntentContract` (and back for revisions), with plain error messages.
- Use cases `saveContract` and `approveContract`: the TypeScript state machine decides the steps (Received, then Context assembled, then Contract drafted; revisions; approval). Approval binds to the hash the reviewer saw; the database refuses any other hash or an older version.
- Task page: contract view with every clause and a hash that is recomputed on each load ("Hash checks out" or a warning that blocks approval), editor for the first version, revise, and approve-this-exact-version control. The Mission Control checklist step "Approve an intent contract" is now live.
- Demo workspace shows sample contracts with real hashes.

### Verified

- 271 tests (19 files): 10 contract-form tests, 8 new use-case tests, 11 new database tests (hash-bound approval, concurrent edits rejected with the transitions rolled back, superseding on revision, grants, isolation). Typecheck, lint and build pass.
- Browser, demo mode: contract view and editor on the task page at 689px.

### Not verified

- Saving and approving against the hosted project (needs `.env.local` and a signed-in session).

### Next

AI drafting of the contract (needs a model provider key), GitHub import and the file workspace, then patch generation and diff review.

## 2026-10-14: migration 3 applied

- Owner-approved, via Claude in Chrome. The SQL Editor contents were hashed in the page and matched the tested file (`sha256 8ce64e78…e3a0`). Purely additive; Supabase showed no destructive-operation warning. Result: success.
- Read-only check afterwards: `intent_contracts` has RLS and no browser insert; `app_save_contract` and `app_approve_contract` are executable by service_role only.
- The hosted project now has all three migrations. When the Supabase CLI is linked, record them so they aren't re-run:
  `supabase migration repair --status applied 20261013120000 20261014090000 20261014120000`
