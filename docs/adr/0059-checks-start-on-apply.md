# ADR 0059: A change's checks start when a person applies it

- Status: accepted (2026-10-24).
- Changes ADR 0047 (verification in one step), which started checks on its own only for a change autonomy applied.

## Context

**Production showed where the journey stopped.** Every change a person applied went to "Verifying" and waited there for a second press: "Run the checks now", or "Check the site now". Three of the owner's changes were still waiting days later. Until they're checked they can't be published without an override (ADR 0050).

A change that applied on its own (autonomy) already had its checks started straight away. A person's "Approve and apply" is at least as clear a go-ahead.

## Decision

**After a person applies a change,** the server action starts its verification exactly as the button would (`startTaskVerification`, trigger "person"):
- a fresh sandbox gets exactly the applied files;
- it installs the packages without their install scripts and runs the checks: the plan's own, or Farbaek's fallback (ADR 0054, ADR 0058);
- it records the receipt and moves the task.

**When the checks can't start, nothing breaks.** That happens on a Review Only server, for a viewer, when there's nothing to check, or when an attempt is already running. The task page then shows why and offers the button, as before. The reason is logged.

**The review says so before the press.** "Once it's applied, its checks start on their own in a fresh sandbox." It shows only when there's a sandbox and something to check: the task page works this out with the same `checksToRun`.

## Consequences

- **Applying a change uses sandbox time from the plan right away,** as pressing the button did, with the same limits and the same refusal when the plan has none left.
- **Fewer changes sit unverified,** and publishing after a successful check needs no override.
- **The button stays** for running the checks again, or when they couldn't start.
