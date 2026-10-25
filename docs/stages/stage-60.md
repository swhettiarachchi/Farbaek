# Stage 60: Policy builder and workspace rules

Spec §9 Policy Builder, and the plan catalog's "Policy builder" on Pro and up, which was marked coming.

- **Decision record:** `docs/adr/0082-workspace-rules.md`.
- **Branch:** `feat/policy-builder`, on top of `feat/outcome-watch`.

## 2026-10-25

### Done

**Rules (core).**
- `path-pattern.ts`: a small glob (`*`, `?`, `**`, .gitignore-style names, trailing `/` for folders) compiled to one anchored regex for JavaScript and Postgres, built from tokens with capped wildcards. Its plain words read like "any file inside src/billing".
- `workspace-rules.ts`: three effects, stop the change (BLOCK), owner or admin (ESCALATE) and always a person (holds level 2), plus parsing with per-field errors, the canonical hash, compiling for the database, Farbaek's own sentence for each rule, and matching.
- `policy.ts` is now version 3: every decision takes the active rules (a required input), adds their findings, never lowers an outcome, and records `workspaceRules: { version, sha256 }`. Shadow mode and the autonomy replay gain the reason "a workspace rule holds it for a person".
- `rule-review.ts` (flags and matching files), `rules-test.ts` (before and after over past changes, stricter and looser) and `rule-draft.ts` (the AI output schema and what's kept from it).

**Database: migration v52.**
- `workspace_rule_versions`, with one active version per workspace, members reading and nothing written by clients;
- `app_activate_workspace_rules`, for owners and admins through the server, validated and audited;
- a trigger on `change_proposals` that refuses any outcome weaker than the active rules need;
- the ledger accepts `policy_draft`.
- **Applied in production and read back:** RLS, grants, the function closed to browsers, the trigger, the ledger check, and no versions yet.

**Server.**
- The active rules are read where every proposal is made: the web app (`ProposalDeps`), and cloud runs and the desktop agent (`AgentStore` in `prepareAgentProposal`). A failed read stops the change.
- Use cases: `draftRules` (Claude, metered and refunded on failure, untrusted output), `testDraftRules` (90 days) and `activateRules` (hash binding, re-tested on the server, the plan needed unless turning every rule off).
- The past-changes read moved to `src/server/trust/history.ts` and is shared with the autonomy replay.

**UI.**
- **`/app/policies`, "Policies" in the navigation:**
  - the built-in policy in words;
  - the active rules;
  - the builder: describe a rule for AI or add one by hand, each rule's effect pills, patterns, reason, sentence, flags and matching files, the test against the last 90 days labelled "Predicted from past changes", and "Activate as version N", off until the exact set on screen was tested;
  - version history, with "Open in the builder".
- Proposal reviews link "workspace rules vN" beside the rules hash.
- The autonomy conditions list "No workspace rule says a person reviews its files".
- `FEATURE_STATUS.policy_builder` is now live.

### Verified

- `tests/db/workspace-rules.test.ts` (8): versions and audit, owners and admins only, refused shapes and expressions, members read their own, the ledger, and the trigger refusing weaker outcomes for each effect, accepting correct ones, and stopping once rules are off.
- Unit tests:
  - `path-pattern.test.ts` and `workspace-rules.test.ts` (35);
  - `policy.test.ts` (5 new);
  - `rules-test.test.ts` (4);
  - `rule-draft.test.ts` (3);
  - `src/server/workspace/workspace-rules.test.ts` (8).
- New security scenario **SE-025**, "A workspace rule bypassed":
  - a change to protected files decided as needing only a contributor is refused;
  - another workspace isn't touched;
  - turning rules off lifts the check;
  - a member, another workspace's owner and a browser can't activate rules.
- `pnpm security:eval`: 25 of 25 passed, and the run report was updated.
- **Demo build at 1280 and 375:**
  - the built-in policy in words;
  - "No rules active";
  - two rules typed into the builder: the sentences "A change to any file inside src/lib or any file inside src/payments needs an owner or admin to approve." and "…package.json always waits for a person, even at autonomy level 2.";
  - the flags "src/payments/ matches no file" and the built-in note;
  - the matching files;
  - drafting, testing and activating off with the demo's reason;
  - no console errors, no sideways scroll.
- `pnpm qa:a11y` on `/app/policies` and `/app/more`: 0 findings. `pnpm qa:responsive` on the same routes: 22 page views, all clean.
- `pnpm typecheck` and `pnpm lint` are clean, and the full `pnpm test` passes: 1,709 passed, 17 skipped.

### Not checked

- A real draft from Claude, a test over real history, and an activation: the demo is read-only. The first real ones will be the owner's on a Pro trial workspace after merging.

### Next

- Incident response (spec §9, Max 2x): incidents with a timeline, containment, and prevention rules proposed into this builder and tested against history before activation (the Incident Replay Theatre).
