# Stage 2: Studio vertical slice (in progress)

## 2026-10-13: intent contracts

### Done

- Migration `20261014120000_intent_contracts.sql` (tested; **applied to the hosted project 2026-10-13**, see below): `intent_contracts` with immutable versions, a SHA-256 of the RFC 8785 canonical body, and draft / approved / superseded status; RLS for members; service-role-only `app_save_contract` and `app_approve_contract`, which store the contract and apply the task transitions in one transaction. A shared `private.apply_transitions` re-checks every step against the current state and version.
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

## 2026-10-13: migration 3 applied

- Owner-approved, via Claude in Chrome. The SQL Editor contents were hashed in the page and matched the tested file (`sha256 8ce64e78…e3a0`). Purely additive; Supabase showed no destructive-operation warning. Result: success.
- Read-only check afterwards: `intent_contracts` has RLS and no browser insert; `app_save_contract` and `app_approve_contract` are executable by service_role only.
- The hosted project now has all three migrations. When the Supabase CLI is linked, record them so they aren't re-run:
  `supabase migration repair --status applied 20261013120000 20261014090000 20261014120000`

## 2026-10-13: draft the contract with AI

### Done

- `src/server/ai/`: a `ContractDrafter` interface and the Anthropic implementation (official SDK 0.128.0, `claude-opus-5-5`, adaptive thinking at medium effort, structured output against `ContractDraftSchema`, `fallbacks: "default"` for policy refusals). Task, project and notes go to the model as JSON data. ADR 0009.
- `src/core/realityloop/contract-draft.ts`: the draft schema and `draftToForm`, which trims, bounds, de-duplicates and keeps anything both allowed and forbidden as forbidden. The draft only prefills the editor. Saving and approval are unchanged.
- `src/config/credits.ts` (`contract_draft` = 1 credit) and `docs/billing/ai-credits.md`.
- Migration `20261015090000_ai_credit_ledger.sql` (tested; **applied to the hosted project 2026-10-13**, see below): `ai_credit_ledger` with RLS for members; `ai_credits_used` (runs as the caller); service-role-only `app_reserve_ai_credits` (allowance re-checked under a lock, period must contain now) and `app_settle_ai_credits` (exactly once, audited).
- Use case `draftContractWithAi`: reserve, call the model, settle with provider-reported tokens, or refund when no draft came back. It tells the person if a refund couldn't be recorded. `aiDraftAvailability` gives the button's honest reason when it's off: no key, demo, viewer, unknown billing, credits used up.
- Editor: a "Draft with AI" panel with the credit cost and what's left, the model that answered, and a reminder that nothing is saved until the person saves. In read-only contexts the editor now opens with disabled fields and the reason ("View the editor").
- Billing page: real AI credit usage. Usage periods share one helper (`usagePeriod`): the trial window during a trial, otherwise the UTC month.
- `pnpm setup:env` asks for an optional Anthropic key; run it again and type `ai` to add only that key.

### Verified

- 307 tests (22 files), including 14 database tests for the ledger, 11 use-case tests with a labelled fake drafter, and 9 for `draftToForm`. Typecheck, lint and build pass.
- Browser, demo mode: the AI panel renders on the task page at 689px and 375px, disabled with the demo reason, with no horizontal scroll.

### Not verified

- A real model call. It needs the Anthropic key in the local env file and a signed-in session.

### Next

Verify one live draft, then GitHub import and the file workspace.

## 2026-10-13: migration 4 applied

- Owner-approved, via Claude in Chrome. The SQL Editor contents were hashed in the page and matched the tested file (6,795 bytes, `sha256 4634b80a…21c8`). Purely additive; Supabase showed no destructive-operation warning. Result: success.
- Read-only check afterwards: `ai_credit_ledger` has RLS, the policy "members read AI credit usage", select-only for authenticated and nothing for anon. `ai_credits_used` runs as the caller (authenticated and service_role). `app_reserve_ai_credits` and `app_settle_ai_credits` are security definer and executable by service_role only.
- The hosted project now has all four migrations. When the Supabase CLI is linked, record them so they aren't re-run:
  `supabase migration repair --status applied 20261013120000 20261014090000 20261014120000 20261015090000`

## 2026-10-13: project files

### Done

- Migration `20261015120000_project_files.sql` (tested, **not applied yet**): immutable `project_file_revisions` (import, edit, delete) and `project_files` pointing at each path's current revision. The database computes hashes and sizes and re-checks paths and limits. Service-role-only `app_import_files` (all or nothing), `app_save_file` and `app_delete_file` with a project lock and per-file optimistic concurrency. `get_project_file` and `search_project_files` run as the caller under RLS. ADR 0010.
- `src/core/workspace/files.ts`: path rules, import screening (dependency and build folders, credentials files, content matching credential formats, binary, size), the file tree and language labels. `src/config/workspace.ts`: 512 KB per file, 4 MB per import, 25 MB and 3,000 files per project.
- Use cases `importProjectFiles`, `saveProjectFile` (secret check included) and `deleteProjectFile`; Supabase writer and reader (paged listing past PostgREST's 1,000-row limit).
- Files page (`/app/projects/[id]/files`): a tree that works without JavaScript, a read-only code view with linkable lines, project-wide search with marked matches, two-step delete, and folder or file import. The browser previews the import, including what will be skipped and why, before anything is uploaded. The project page shows a Files card.
- Demo workspace: seven sample files in the Storefront project, labelled as sample.

### Verified

- 350 tests (25 files): 14 database tests (including SQL and TypeScript path-rule parity), 22 for the file rules and 7 for the use cases. Typecheck, lint and build pass.
- Browser, demo mode: tree, file view with `#L8` highlighted, search results, and import and delete disabled with the demo reason, at 689px and 375px with no horizontal scroll.

### Not verified

- Importing into the hosted project: needs migration 5 applied, the env file and a signed-in session.

### Next

The CodeMirror editor (needs a dependency install), then targeted patches, diff review and checkpoints on top of the revisions.

Note on dates: entries above were first written with later dates (2026-10-14 and 2026-10-15). Everything here happened on 2026-10-13. Migration filenames (`20261014…`, `20261015…`) are ordering versions only and stay as they are, because migrations 2 to 4 are already applied under those names.
