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

## 2026-10-13: ProofPacks

### Done

- `src/core/proof/proofpack.ts` (ADR 0012): in-toto statements whose subjects are the applied file digests. The predicate records the task, the contract, the proposal, the policy decision, the approval, the changes, the required checks with real exit codes, the execution mode, the record's limits and the previous digest. The status comes from real results only, and an integrity check recomputes the canonical digest.
- Migration `20261015210000_proofpacks.sql` (tested; **applied to the hosted project 2026-10-13**): an append-only `proofpacks` table where a trigger refuses every update; `app_apply_proposal` records the ProofPack in the same transaction, checks it names this proposal, approval, status and files, and enforces the per-project hash chain.
- `applyProposal` builds the ProofPack from the approved contract's required checks and the current execution mode. In Review Only it's unverified, and its limits say checks didn't run.
- Task page: an Evidence card per ProofPack with status, digest, "Record intact" (recomputed on every load), checks marked "not run", limits, the previous link and a JSON download (`/app/proofpacks/<digest>`, members only). The Seal appears only for verified, intact evidence.

### Verified

- 422 tests (31 files): 12 ProofPack tests (status rules, limits, tamper detection, order independence, chaining), 4 new database tests (recorded and chained, bad chain, wrong proposal or status rejected with nothing applied, immutable even for the server, removed with its task), and 2 new use-case tests. Typecheck and lint pass.
- Migration 8 on the hosted project: the SQL Editor contents matched the tested file (7,911 bytes, `sha256 669bf104…3bfe`). Supabase warned about the `drop function` line, which replaces `app_apply_proposal` in the same transaction; no table or data is dropped. Confirmed, result: success. Read-only check: `proofpacks` has RLS (select-only for authenticated, nothing for anon), the `proofpacks_immutable` trigger is enabled, the members-read policy exists, and one service-role-only `app_apply_proposal` exists. RPC parameter names match (scripted check).
- All eight migrations are on the hosted project:
  `supabase migration repair --status applied 20261013120000 20261014090000 20261014120000 20261015090000 20261015120000 20261015150000 20261015180000 20261015210000`

### Next

Leases on approvals, scope drift between the contract and the applied diff, and signing. Real verification still waits for a sandbox provider (ADR 0003).

## 2026-10-14: scope drift, recent evidence, approvals inbox

### Done

- `src/core/realityloop/scope-drift.ts`: compares every file change since the contract was approved with the contract. That covers direct edits, imports, restores, deletions and applied proposals. A first revision counts as files.create, a later one as files.edit, and a deletion as files.delete. A change drifts when its operation is forbidden or not allowed, or its path is outside the contract's path scope. The path rule is the same one proposals use (`pathScope`).
- Task page: a "Scope since approval" card for active tasks with an approved contract. It shows either "no changes" or "all inside the contract", or lists each drifting change with its operation, the reasons, whether it was direct or from a reviewed proposal, and when. Drift is reported, not blocked.
- Mission Control: a Recent evidence card with the latest ProofPacks (status, task, digest, time). The checklist's "verified ProofPack" step now says honestly why it's locked: checks need a sandbox.
- Approvals page: each waiting change shows its file count and policy outcome. An escalated change notes when the viewer can review but not approve. The outdated "arrives in Stage 3" copy is gone.
- Readers: `listFileChangesSince` and `listRecentProofPacks` (Supabase through RLS; demo equivalents).

### Verified

- 429 tests (33 files): 4 scope-drift tests, a demo test for change history, and 2 server-render tests of the Scope card's markup (text labels next to icons, nothing conveyed by colour alone). Typecheck, lint and build pass.
- The live app (real Supabase keys) builds and starts, and `/app` routes redirect to sign-in.

### Not verified

- These screens in the browser. The demo workspace only runs when Supabase isn't configured, and the real keys are now built in, so signed-in pages need a real session. They'll be checked once the owner signs in.

## 2026-10-14: first live use

- The owner signed in with an email link and created the workspace "Far001" on the hosted project. The 14-day Team trial started (ends 2026-10-28), and Mission Control showed real records, including the empty Recent evidence card. Checked from the owner's screenshot.
- That screenshot showed the sidebar still listing Studio and Trust as unbuilt. Fixed: the list now names what is still missing (previews and test runs, simulations and recovery), and other stale "arrives in Stage N" copy now says what exists today (`108fbfb`).
- Still to check live: creating a project, importing files, a task with a hand-written contract and its approval. AI drafting and proposals need the Anthropic key.

## 2026-10-14: live setup through the owner's browser

Done with Claude in Chrome, at the owner's request, on the owner's signed-in session at `localhost:3000` against the hosted project:

- Created the project "Farbaek" (`app_create_project`).
- Imported 10 real root-level files from the repo (README, CLAUDE.md, package.json and the configs; 11 KB) through the import panel's preview (`app_import_files`). Generated build files, the lockfile and the owner's AGENTS.md were left out.
- Then imported the rest of the tracked source (189 new files: `src`, `tests`, `docs`, `supabase`, `scripts`) through the same panel, by handing the folder input the files the native picker would give it. The import screen ran as usual. Result: "Imported. 189 new", 199 files, 1.0 MB.
- Opened `package.json` (all 60 lines rendered, database hash shown) and searched "vitest" (`get_project_file`, `search_project_files`).
- Created the task "Let owners archive a project from the project page", a real gap: the usage page mentions archiving, but there's no control for it yet (`app_create_task`).
- Wrote contract version 1 by hand (no Anthropic key yet): path resources, files.edit and files.create allowed, files.delete forbidden, and pnpm typecheck and pnpm test as required checks. Saved it (`app_save_contract`): "Hash checks out: sha256:a74829…e096". Approved it (`app_approve_contract`): the task reached Contract approved.
- The new cards worked live: Scope since approval said "No files changed since the contract was approved." The Change card listed the 10 files and kept "Propose a change" off with "AI isn't connected on this server yet."
- Mission Control: 4 of 5 checklist steps done from real records.
- Fixed while doing this: the sidebar's longer labels wrapped "Stage 2" over two lines. They're now "Test runs" and "Recovery", with the stage tag kept on one line.

- After the bulk import, the Scope card reported "141 of 189 changes fall outside the contract" as one long flat list, and called every import a direct change. That's what led to the grouping below.

Not exercised live yet: saving an edited file, history and restore, and anything that needs the Anthropic key (drafting, proposals, apply, ProofPacks).

## 2026-10-14: archiving projects, grouped scope drift

### Done

- Archiving (the task created above). Owners and admins get an Archive card on the project page with a two-step confirm. An archived project leaves the list and stops counting toward the plan's project limit, and its name is free again. Nothing is deleted: files, tasks, contracts, proposals and ProofPacks stay readable by id. Its files are read-only, and new tasks can't be added. Contributors see the control disabled with the reason.
- Migration `20261016090000_archive_projects.sql`: `app_archive_project` (service-role only; owner or admin; refuses a second archive; writes a `project.archived` audit event). `private.lock_project` now refuses changes to an archived project with PROJECT_ARCHIVED instead of NOT_FOUND, so imports, saves, restores, deletes and proposal applies say why.
- Use case `archiveProject` checks the role before the database does; new error codes PROJECT_ARCHIVED and ALREADY_ARCHIVED with plain messages.
- Scope drift findings carry their origin (applied proposal, direct edit, deletion, import). The Scope card groups them by origin and then by folder, each folder expandable, so a bulk import reads as a few lines instead of a hundred.

### Verified

- 436 tests (34 files), including PGlite tests for archiving: managers only, the quota slot and name are freed, files stay readable, and imports and saves are refused with PROJECT_ARCHIVED. Typecheck and lint pass.
- Migration 9 on the hosted project: the SQL Editor contents matched the tested file (2,388 bytes, `sha256 9d5d8671…f082`). Result: success. Read-only check: `app_archive_project` is security definer and executable by `service_role` only (not anon, not authenticated); `private.lock_project` contains the PROJECT_ARCHIVED check.
- All nine migrations are on the hosted project:
  `supabase migration repair --status applied 20261013120000 20261014090000 20261014120000 20261015090000 20261015120000 20261015150000 20261015180000 20261015210000 20261016090000`
