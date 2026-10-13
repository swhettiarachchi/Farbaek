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

- Migration `20261015120000_project_files.sql` (tested; **applied to the hosted project 2026-10-13**, see below): immutable `project_file_revisions` (import, edit, delete) and `project_files` pointing at each path's current revision. The database computes hashes and sizes and re-checks paths and limits. Service-role-only `app_import_files` (all or nothing), `app_save_file` and `app_delete_file` with a project lock and per-file optimistic concurrency. `get_project_file` and `search_project_files` run as the caller under RLS. ADR 0010.
- `src/core/workspace/files.ts`: path rules, import screening (dependency and build folders, credentials files, content matching credential formats, binary, size), the file tree and language labels. `src/config/workspace.ts`: 512 KB per file, 4 MB per import, 25 MB and 3,000 files per project.
- Use cases `importProjectFiles`, `saveProjectFile` (secret check included) and `deleteProjectFile`; Supabase writer and reader (paged listing past PostgREST's 1,000-row limit).
- Files page (`/app/projects/[id]/files`): a tree that works without JavaScript, a read-only code view with linkable lines, project-wide search with marked matches, two-step delete, and folder or file import. The browser previews the import, including what will be skipped and why, before anything is uploaded. The project page shows a Files card.
- Demo workspace: seven sample files in the Storefront project, labelled as sample.

### Verified

- 350 tests (25 files): 14 database tests (including SQL and TypeScript path-rule parity), 22 for the file rules and 7 for the use cases. Typecheck, lint and build pass.
- Browser, demo mode: tree, file view with `#L8` highlighted, search results, and import and delete disabled with the demo reason, at 689px and 375px with no horizontal scroll.

### Not verified

- Importing into the hosted project: needs the env file and a signed-in session.

### Next

The CodeMirror editor (needs a dependency install), then targeted patches, diff review and checkpoints on top of the revisions.

## 2026-10-13: migration 5 applied

- Owner-approved, via Claude in Chrome. The SQL Editor contents were hashed in the page and matched the tested file (14,295 bytes, `sha256 511ecfd9…f6a4`). Supabase showed its destructive-operation warning because the body of `app_delete_file` contains a `delete from public.project_files` statement. That statement runs only when someone deletes a file later. The migration itself only creates objects. Confirmed, result: success.
- Read-only check afterwards: both tables have RLS, select-only for authenticated and nothing for anon; the policies "members read files" and "members read file revisions"; `get_project_file` and `search_project_files` run as the caller; `app_import_files`, `app_save_file` and `app_delete_file` are security definer and executable by service_role only; the private helpers aren't executable by anon, authenticated or service_role. `private.valid_project_path` accepted `src/app/page.tsx` and rejected `../escape`, `a//b` and `/abs`.
- The hosted project now has all five migrations:
  `supabase migration repair --status applied 20261013120000 20261014090000 20261014120000 20261015090000 20261015120000`

## 2026-10-13: code editor and diff review

### Done

- CodeMirror 6 installed (owner-approved) with exact pins, all at least two weeks old: `@codemirror/state` 6.7.6, `view` 6.43.13, `commands` 6.11.1, `language` 6.12.4, `search` 6.7.2, `merge` 6.12.2, `lang-javascript` 6.2.5, `lang-json` 6.0.2, `lang-css` 6.3.1, `lang-markdown` 6.5.2, `lang-html` 6.4.12, `@lezer/highlight` 1.2.5. pnpm overrides keep view and language releases from 2026-10-07, and `@lezer/css`, `javascript`, `lr` and `markdown` releases from 2026-10-01 to 2026-10-07, out of the tree. One version of each package in the lockfile.
- `src/components/files/codemirror.tsx`: loaded only on editing screens. Syntax colours come from the design tokens (signal blue, signal cyan, ink). Search, history, bracket matching, line wrapping on phones, 16px text on phones. The review mode is a unified diff against the saved revision, with Accept and Reject on each changed chunk and unchanged lines collapsed.
- `FileEditor`: edit, then review the exact change (with +added and −removed line counts), then save as the next revision. Rejected chunks stay rejected when you go back to editing. A warning appears before leaving with unsaved changes. New files get a path field with inline checks (`..`, credentials files, build folders). Secrets are blocked before review, and again on the server.
- `saveFileAction`, with the revision the person started from. A concurrent save returns "Someone changed this file".
- In read-only contexts (demo, viewers) the editor opens ("Try the editor") with Save off and the reason shown.

### Verified

- 350 tests pass; typecheck, lint and build pass.
- Browser, demo mode: the editor loads with highlighting; typing marks it unsaved; the review shows "+1 −0 lines" and Accept/Reject on the chunk; Reject restores the saved text and reports nothing to save; Save is disabled with the demo reason. New file at 375px: inline path checks, 16px text, no horizontal scroll.

### Not verified

- Saving to the hosted project (needs the env file and a signed-in session).

### Next

Targeted AI patches: the agent proposes a change to specific files, the person reviews it in this same diff view, and accepted chunks are saved as revisions tied to the task.

## 2026-10-13: file history and restore

### Done

- History for every file (`?history=1`): revisions newest first, showing imported, edited or deleted, when, size and hash. Pick an earlier revision to see what changed since then as a read-only diff, with line counts.
- Restore saves the earlier content as the next revision, through the same checks as any save (`restoreRevisionAction`, then `saveProjectFile`). History is never rewritten. Deleted files can be restored from their history.
- Readers: `listFileRevisions` and `getFileRevision` (Supabase through RLS; the demo has a two-revision sample file).

### Verified

- 351 tests; typecheck, lint and build pass.
- Browser, demo mode: `src/lib/products.ts` history shows revision 2 (current) and revision 1; the comparison shows "+4 −2 lines since then" without accept or reject buttons; Restore is disabled with the demo reason.

### Next

Targeted AI patches on top of this: the agent proposes edits to named files under an approved contract, the person reviews each file in the diff view, and accepted changes become revisions linked to the task.

## 2026-10-13: change proposals

### Done

- Migration `20261015150000_change_proposals.sql` (tested; **applied to the hosted project 2026-10-13**, see below): `change_proposals` with RLS; service-role-only `app_create_proposal` (base revisions must be current, each hash must match its content, the contract version must be the approved one, and the final task state must match pending or blocked), `app_apply_proposal` (all or nothing, refuses stale files, writes revisions linked to the proposal) and `app_discard_proposal`. `private.apply_transitions` now records agent and system steps under their own actor. The AI credit ledger accepts `change_proposal`. ADR 0011.
- `src/core/realityloop/change-proposal.ts`: anchored find/replace edits (exactly one match or the edit is dropped), screening, contract checks (operations, record limit, path scope), proposal and applied-content hashes. New state machine event `discard_plan` (from APPROVAL_PENDING or BLOCKED back to CONTRACT_APPROVED).
- Claude proposer (streamed structured output, refusal fallbacks), 3 credits per proposal with refunds when nothing usable comes back. The shared credit logic moved to `ai-credits.ts`.
- Use cases `proposeChange`, `applyProposal` and `discardProposal`; Supabase reads and writes.
- Task page: a Change card. With an approved contract, choose up to 20 files (filter, live size counter), add notes and propose. For a proposal: the plan, flagged risks, the contract check, word-only invariants listed for a person, dropped changes with reasons, and each file as a diff with accept and reject per chunk. Approve and apply the exact content, or discard. After applying, the screen says plainly that it is not verified because no isolated runner is connected.
- The contract drafter now writes code contracts with path resources and `files.*` operations.
- Demo: two code tasks. One has an approved contract (shows the propose form). The other has a sample proposal built from the sample files with the live rules, labelled "sample (no model call)".

### Verified

- 382 tests (28 files): 7 new database tests, 10 for the proposal rules, 9 use-case tests with a labelled fake proposer, 2 state-machine tests and a demo test that runs the sample through the live rules. Typecheck, lint and build pass.
- Browser, demo mode, narrow pane (473px): the review shows status, hash, plan, risks, a passing contract check, the invariant to check by hand and two wrapped diffs. Approve and Discard are disabled with the demo reason. The propose form selects files with a live counter. No horizontal scroll.

### Not verified

- A real proposal from Claude and applying it on the hosted project: needs the Anthropic key in the env file and a signed-in session.

### Next

Project-level checkpoints and the sandbox runner decision (ADR 0003), so VERIFYING tasks can run their checks.

## 2026-10-13: migration 6 applied

- Owner-approved ("you have access to set up everything"), via Claude in Chrome. The SQL Editor contents were hashed in the page and matched the tested file (14,663 bytes, `sha256 ef7ebd11…d241`). Supabase showed no warning this time. Result: success.
- Read-only check afterwards: `change_proposals` has RLS, the policy "members read change proposals", select-only for authenticated and nothing for anon. `app_create_proposal`, `app_apply_proposal` and `app_discard_proposal` are security definer and executable by service_role only. `ai_credit_ledger_operation_check` allows `contract_draft` and `change_proposal`. `project_file_revisions.proposal_id` exists. `private.apply_transitions` reads `actor_kind`.
- The hosted project now has all six migrations:
  `supabase migration repair --status applied 20261013120000 20261014090000 20261014120000 20261015090000 20261015120000 20261015150000`

## 2026-10-13: execution boundary and Review Only

### Done

- `SandboxProvider` interface and `executionMode` (ADR 0003): sandboxed only with verified microVM isolation and restricted egress, otherwise Review Only with a reason. `verificationEvent` maps real exit codes to verified, partially verified or failed, and to no event when all checks pass without a ProofPack or none ran. A test confirms it agrees with the state machine's guards.
- No adapter is installed, so the server always reports Review Only.
- Settings: an Execution card with the mode, the reason, and what works and what doesn't.
- Task page: a Verification card for tasks in verification, listing the contract's required checks as "Not run". The proposal's applied note uses the same reason.

### Verified

- 387 tests; typecheck, lint and build pass. Browser, demo mode: the Settings Execution card at 473px.

### Next

The owner chooses a sandbox provider (E2B or Vercel Sandbox: an account, a key and a cost review). Then an adapter, a runner for tasks in verification, and the ProofPack that verification requires.

Note on dates: entries above were first written with later dates (2026-10-14 and 2026-10-15). Everything here happened on 2026-10-13. Migration filenames (`20261014…`, `20261015…`) are ordering versions only and stay as they are, because migrations 2 to 4 are already applied under those names.
