# ADR 0050: The Launch Evidence Gate

- Status: accepted (2026-10-23).
- Spec: §12 LaunchOS, the innovation backlog's Launch Evidence Gate ("deploying a commit without a verified ProofPack requires an explicit, logged override by an authorized role"), and the Stage 6 acceptance ("no deploy without a verified ProofPack or a logged override"). Builds on ADR 0012 (ProofPacks), ADR 0029 (published sites), ADR 0033 (LaunchOS A) and ADR 0047 (verification in one step).

## Context

**Publishing a site is Farbaek's deploy today.** It was gated by a finished security check of exactly the files going live, with nothing critical. Whether the change behind those files had been verified wasn't checked.

**The Launch page already showed** "Evidence for the latest change", from the newest ProofPack among the project's recent tasks. That isn't a safe rule to enforce:
- **Out-of-order check runs:** verification ProofPacks are appended to the project's chain whenever a check run finishes. Change A's run can land after change B was applied, so the newest ProofPack can say "verified" while change B was never checked.
- **Files without ProofPacks:** hand edits in the file editor, undos and imports write new revisions and no ProofPack. A verified change followed by a hand edit doesn't describe the files going live.

**Verification is now one click** (ADR 0047), so asking for it before a launch is no longer a burden.

## Decision

**The rule.** One definition, in `private.launch_evidence` (migration v33) and `launchEvidence` (`src/core/publish/evidence.ts`):
- **C:** the project's latest *change* ProofPack, the one written when a change is applied. A verification ProofPack has `predicate.verification`; a change's own doesn't.
- **None:** there's no C.
- **Changed:** a file revision was written after C. Applying a change writes its revisions and its ProofPack in one transaction, so their times are equal; anything later is a change no ProofPack covers. Deletions count, since the revision history records them.
- **Otherwise,** the result of the latest check run of C, the one whose `predicate.verification.appliedProofPack` is C. When nothing ran, C's own status, usually `unverified`.

**Publishing.**
- **With `verified` evidence,** publishing works as before, for any contributor.
- **Any other state needs an override:**
  - an owner or admin;
  - a reason of 10 to 500 characters.
- **Members** see who can publish it, and the task where the checks run. Domains and earlier versions stay in reach.
- **The database has the final word.** `app_publish_site` checks the evidence after the security gate, under the same lock:
  - no reason → `EVIDENCE_REQUIRED`;
  - the wrong role → `OVERRIDE_FORBIDDEN`;
  - a short or long reason → `REASON_REQUIRED`.
- **Old calls:** the new parameter has a default, so calls without it still resolve, and they're refused without evidence.

**What's recorded.**
- **On every version** (`site_deployments`):
  - `evidence`, the state;
  - `evidence_proofpack`, the check run's ProofPack, or else the change's own;
  - `override_reason`.
- **A constraint** keeps a reason present exactly when the evidence isn't verified.
- **Who overrode** is the version's `created_by`: the person publishing is the one giving the reason, so there's no separate column.
- **The `site.published` audit event** gains `evidence`, `proofpack` and `override`.
- **Versions from before v33** have no evidence recorded and show none.

**The chain.** Each version names its ProofPack, and live checks already belong to a version, so a launch reads as one chain:
- security check;
- ProofPack;
- version;
- live check.

The Launch page's live step says which evidence the live version went out with, or the reason given.

**Rollback stays as it was.** Making an earlier version live again uses that version's own record. It isn't a new deploy of unchecked files.

## Consequences

- **Projects with no agent changes** (hand-made or imported sites) always need a reason, which is honest: nothing verified them. Most such publishes are by owners, for whom it's one sentence.
- **Static sites can be verified** only when their contract lists checks that can run in a sandbox. A plain HTML site whose contract lists none can't be, so it goes live with a reason. Checks for static sites (links, HTML validity) would close this and are left for later.
- **The TypeScript reads** (`latestEvidence`) are three small queries under RLS, with the ProofPack statement left out. The demo, which has no ProofPacks, shows "No evidence".
- **New eval scenario SE-024,** "Deploying without evidence" (ASI09, LLM06), checks the database refusals and the record.
