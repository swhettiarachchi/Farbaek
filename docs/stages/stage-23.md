# Stage 23: Launch Evidence Gate

The spec's LaunchOS acceptance:

> no deploy without a verified ProofPack or a logged override

Publishing a site is Farbaek's deploy, and it was gated only by a security check of the files. This stage makes the evidence a gate, enforced in the database.

- **Plan:** approved 2026-10-23.
- **Decision record:** `docs/adr/0050-launch-evidence-gate.md`.
- **Branch:** `feat/launch-evidence-gate`, from `main` after #29.

## 2026-10-23

### Done

**The rule,** one definition in SQL (`private.launch_evidence`) and TypeScript (`launchEvidence`, `src/core/publish/evidence.ts`):
- **Which ProofPack counts:** the latest *change* ProofPack, and only a check run of that exact change. The newest ProofPack can be a late check run of an earlier change.
- **Later files:** any file revision after the change was applied (a hand edit, an undo, an import) makes the state "Files changed since".
- **The six states:**
  - verified;
  - not verified;
  - partly verified;
  - checks failed;
  - files changed since;
  - no evidence.

**Database (migration v33, `20261104090000_launch_evidence.sql`):**
- **`site_deployments` gains:**
  - `evidence`;
  - `evidence_proofpack`;
  - `override_reason`, with a constraint: a reason exactly when the evidence isn't verified.
- **`app_publish_site`** gains `p_override_reason` (default null, so old calls resolve). Without verified evidence it raises:
  - `EVIDENCE_REQUIRED` with no reason;
  - `OVERRIDE_FORBIDDEN` for members;
  - `REASON_REQUIRED` outside 10 to 500 characters.
- **The `site.published` audit event** records the evidence, the ProofPack and the reason.
- **No `override_by` column**, unlike the plan: it would always equal the version's `created_by`.

**Server:**
- `latestEvidence` makes three small RLS reads, and doesn't fetch the statement.
- `publishReadiness` returns the evidence.
- `publishSite` checks the reason and the role before the database.
- The publish action takes `overrideReason`.

**UI:**
- **The publish panel:**
  - an evidence row (icon, title and sentence, with "Open the task");
  - for owners and admins, a required "Why publish without verified evidence?" field and a "Publish without verified evidence" button;
  - for members, the reason they can't, with domains and rollback still available;
  - each version shows "Verified" or "Without verified evidence", with its reason.
- **The Launch page:** the evidence step uses the same rule. The live step says which ProofPack the live version went out with, or the reason given.
- **The build film's publish scene** shows a verified sample change, matching its Launch scene.

**Security eval:** SE-024, "Deploying without evidence" (ASI09, LLM06), on a real applied change. The report was regenerated: 24 scenarios.

**Docs:**
- ADR 0050;
- a threat model section;
- current state.

### Verified

- **Checks:**
  - `pnpm typecheck` and `pnpm lint` are clean.
  - `pnpm test`: 1,295 passed and 14 skipped. That includes five new database tests for the gate, three new publish use-case tests and the new `evidence.test.ts`.
  - `pnpm security:eval`: 24 of 24 scenarios pass.
- **Database tests (PGlite):**
  - a project with no ProofPack is refused without a reason, with a blank one, with a short one, by a member, and through the old 7-argument call;
  - an owner's reason is stored trimmed, on the version and in the audit event;
  - a verified check run publishes without a reason, and the reason is ignored;
  - a late check run of an earlier change doesn't count;
  - a partly verified run records `partially_verified`;
  - an import after a verified change needs a reason ("changed");
  - the constraint refuses a non-verified version without a reason.
- **Production database:**
  - v33 applied with the hash-verified pattern (`7f62848a…78efd`);
  - read back:
    - the 8-argument `app_publish_site`, executable by `service_role` and `postgres` only;
    - the three new columns;
    - `private.launch_evidence` and `private.require_override_role`;
  - the one existing version has no evidence recorded, as intended;
  - the schema is reloaded.
- **Production PostgREST:** the two JSON-path queries `latestEvidence` sends parse, returning 200 and no rows without credentials. A deliberately broken filter returns `PGRST100`, so the probe really exercised the parser.
- **Demo production build:**
  - the Launch page's evidence step reads "Missing" with the new sentence;
  - there's no sideways scroll at 375px.

  The publish panel needs a live workspace, so its states are covered by the server tests and the build film's frames.
- **The build film** was re-recorded (landscape 4.84 MB, portrait 4.11 MB). A still at 43.6 seconds shows the evidence row: "Verified. The latest change's checks passed in a sandbox against exactly these files."

### Not verified yet

- **A publish through the live panel** in production, with and without a reason. It needs a signed-in workspace with a published-ready project.
- **A real verified change:** a check run in a live sandbox (still open from Stage 20).

### Next

- **Checks for static sites** (links, HTML validity) that can run in a sandbox, so a plain HTML site can be verified instead of needing a reason.
- **LaunchOS with a real provider,** once the owner chooses one.
