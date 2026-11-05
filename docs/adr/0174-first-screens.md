# ADR 0174: What a newcomer meets first

- Status: accepted (2026-11-05).
- Extends ADR 0170 (plain words and one next step) past the pages it guarded. Works with ADR 0172 (the motion budget) and ADR 0171 (no price on Android).

## Context

The owner asked for every part of the platform to be tested as a real person would use it, for people with no technical knowledge. So all 41 routes were walked at phone width on a demo build: the words read as a newcomer would read them, every first screen looked at. Tests and scanners were green before this, and these problems were still there:

- Status badges stretched across the whole row on phones.
- With two changes waiting, Home's first screen didn't mention them.
- Pricing's first price was more than a screen down on a phone.
- Settings opened with where checks run, then levels numbered 0, 2, 3 and 4.
- The Desktop app page made a PowerShell hash check step 1 of installing.
- ADR 0170's guard read only `src/app/app` and `src/components`. Messages from the server reach the same screens, so people still read "The contract isn't complete", "The policy escalated this change" and "No verified sandbox is connected".

## Decision

**Lead each first screen with what the person came for.**
- **Home** starts with what needs you, when something does: the agent's question first, because it has stopped until someone answers, then the changes this person can decide, then any that ran out of time. A task's state isn't enough to say so, so Home reads each change the way Approvals does:
  - a change the rules send to an owner or admin isn't a member's turn;
  - one that ran out of time can't be approved, so it says that;
  - a task with no open change has nothing to approve, so it isn't mentioned;
  - only the person who started a run, or an owner or admin, is told the agent is waiting;
  - nothing in an archived project asks, and a read-only workspace gets only its own notice.
  Someone who can only look is told it's someone else's decision and offered nothing to press.
- **Pricing** shows the plans first. The promises and the billing note follow them.
- **Settings** goes workspace, people, then your own email, device and phones, then how much the agent can do.
- **The Desktop app page** gives the install steps a person must do. Checking a file's fingerprint is one optional fold away, and it stays available for anyone who wants it. Touch-first screens are told it runs on a computer.

**The levels have names, not numbers, on screen.** Every change waits for a person; Practice mode; Small, checked changes apply on their own; Bigger, checked changes apply on their own; Workflows. Stored values, code, ADRs and the Security page keep the numbers.

**One vocabulary, wherever a sentence comes from.** `tests/design/plain-words.test.ts` now also reads `src/core`, `src/server`, Pricing, Verify and Offline, and bans the words fixed here.

**What must stay exact is left alone, on purpose.** Plain words are for what people read. These don't change, and the guard skips them:
- rule sets whose hash is their version (`CHANGE_POLICY_RULES`, `AGENT_POLICY_RULES`), since rewording them would change the version every decision records;
- prompts to a model;
- sandbox receipts, and the hand-off file inside a project export;
- the Security page's scenarios, the legal pages and `/proofpack`, whose readers need the exact terms;
- raw database errors and the staff console.

A rule's `why` isn't in the hash, so it could be reworded without changing the rules version.

Some refusals and findings are read by models as well as people, so the agent's and the second reviewer's prompts each gained one line saying what "the plan" and "the rules" mean there.

**A plan's features say what's true.** Plain words made three old labels flatly false, so they were corrected, with no price or allowance changed: exporting your proof is on every plan, the signed record is of each change you apply and not of every action, and the emergency pause is on every plan, so the paid feature is named for the incident tools it really is.

## Consequences

- A person meets one set of words across the app, the server's messages, Pricing and the iPhone, which reads the same server. The desktop app's own screens are the exception until its next release, because they're built into the installer.
- Approvals' count and the phone's badge still include a change in an archived project, which Home's card leaves out.
- Reviewers reading older records may see older words: a ProofPack or a rule decision keeps the sentence it was written with.
- The public site's own pages and films still use some older words ("Evidence", "Modules", "LaunchOS"). That's the next sweep.
- This is a careful stand-in for a person who has never seen Farbaek, and it isn't the same thing. Nobody new has used it yet.
