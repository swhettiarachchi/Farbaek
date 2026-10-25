# ADR 0082: Workspace rules and the policy builder

- Status: accepted (2026-10-25).
- Builds on ADR 0004 (the policy engine), ADR 0046 (autonomy level 2), ADR 0075 (shadow mode) and ADR 0081 (counterfactual replay).
- Spec §9: "Policy Builder: natural language → structured draft → explained interpretation → ambiguities and conflicts flagged → examples → tests against sample events → confirmation → versioned activation. Natural language never becomes authoritative enforcement directly."

## Context

Every change is judged by one built-in rule set (`CHANGE_POLICY_RULES`). It blocks broken contracts, sends sensitive files to an owner or admin, and lets level 2 apply small checked changes. Workspaces have files that matter to them and that no general rule knows about: billing code, a payments folder, generated files nobody should edit. The plan catalog sold a "Policy builder" on Pro and up, marked as coming.

## Decision

**Workspace rules add to the built-in policy, and can only make a change stricter.** A rule names files by pattern and gives one of three effects:

| Effect | Outcome | Meaning |
| --- | --- | --- |
| `block` | BLOCK | No change to these files can be approved. |
| `owner_approval` | ESCALATE | An owner or admin must approve. |
| `person_approval` | REQUIRE_APPROVAL | Always waits for a person, even at level 2. |

Nothing in a rule can lower an outcome. The built-in rules, contract checks and autonomy limits all still apply. The rule set's schema becomes `farbaek.policy/v3`, so new decisions carry a new policy version. Each decision also records the workspace rule version it used.

**Patterns are a small, safe glob** (`src/core/trust/path-pattern.ts`):
- `*`, `?` and `**`;
- a name with no `/` before its end matches in any folder, as in .gitignore;
- a trailing `/` covers a folder.

Each pattern compiles to one anchored regular expression that JavaScript and Postgres read alike. It's built from tokens, with wildcards capped, so a pattern can't make matching slow.

**The builder follows the spec's flow on `/app/policies`:**
1. **Natural language to a draft.** Claude turns a description into structured rules (operation `policy_draft`, metered and refunded on failure). It also lists what it assumed and what rules can't express, such as a number of approvals or a named person. The output is untrusted: invalid patterns are dropped and listed, and it only fills the form.
2. **An explained interpretation.** Each rule's sentence ("A change to any file inside src/billing needs an owner or admin to approve.") comes from Farbaek's code, not a model.
3. **Flags:** a pattern matching no current file (said only when every file was read), one covering every file, a rule the built-in policy already covers, overlapping rules (the stricter applies), and duplicates.
4. **Examples:** the files in the workspace's projects that each rule matches.
5. **A test against real history.** The draft and today's rules are each run over the last 90 days of changes (`app_replay_history`, shapes only), with today's autonomy. The result counts what each change would have needed before and after, both stricter and looser. It is labelled "Predicted from past changes".
6. **Confirmation bound by hash.** "Activate" stays off until the exact set on screen, by canonical JSON, has been tested. The browser sends the set and its SHA-256. The server recomputes the hash, refuses a mismatch, tests the set again itself, and stores that result with the version.
7. **Versioned activation** (migration v52):
   - `app_activate_workspace_rules` is for owners and admins only, through the server;
   - each activation is a new numbered version, with one active per workspace, and an audit event;
   - turning every rule off activates an empty set;
   - any earlier version can be opened in the builder, tested and activated again.

**Enforced twice.**
- **The server.** Every proposal path passes the active rules into `evaluateChangePolicy`: the web app, cloud runs and the desktop agent. The input field is required, so a path can't leave it out. Reading the rules fails closed: if they can't be read, the change isn't made.
- **The database.** A before-insert trigger on `change_proposals` matches each changed path against the active version's compiled patterns. It refuses an outcome weaker than the rules require (`WORKSPACE_RULES_CHANGED`), whichever path created the proposal, including a race with an activation.

**Undo keeps the built-in policy alone.** Undo restores a state people already reviewed. A change a rule escalated stays escalated for its undo, through the proposal's own outcome.

**Plans.** Drafting, testing and activating rules need the policy builder: Pro and up, and the trial. Rules already active keep applying if the plan lapses, since they only make changes stricter, and turning them all off is always allowed. Everyone in a workspace can read its rules; viewers can't draft or test.

## Consequences

- A workspace can protect what matters to it without waiting for Farbaek to add a built-in rule, and sees what a rule would have done before it applies.
- Reviewers see the matching rule, its version and its reason in each change's policy findings.
- The autonomy replay (ADR 0081) and shadow mode include the active rules, with the new reason "a workspace rule holds it for a person".
- Incident response can propose a prevention rule into this builder, where it's tested against history before activation, as the spec's Incident Replay Theatre asks.
