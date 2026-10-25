# ADR 0081: Counterfactual policy replay

- Status: accepted (2026-10-25).
- Builds on ADR 0046 (autonomy level 2) and ADR 0075 (shadow mode).
- Spec Stage 8: "Counterfactual replay: Replay sanitized historical traces against a proposed policy … Compare decisions, scope, failures … Never repeat real side effects. Explain where an external system can't be reproduced faithfully."

## Context

Shadow mode (ADR 0075) tells an owner how level 2 would behave, but only for changes made from the moment rehearsal starts. An owner choosing limits wants an answer now: "with up to 3 files, what would have applied on its own this month, and how did those changes turn out?"

## Decision

**Replay on Settings > Autonomy.** With the limits shown (rehearsing, or level 2), "Replay the last 30 days" runs the policy over the workspace's past changes. It uses the same evaluation as shadow mode, so a replay and a rehearsal judge alike, and it shows the result as the rehearsal record does: how many would have applied, what really happened to those (passed, failed, discarded, waiting), why the others would have waited, and the change to look at first.

**Only the shape of each change** comes back (migration v51, `app_replay_history`):
- the files' paths and kinds;
- whether it broke its contract;
- whether the desktop agent made it;
- whether its contract listed checks;
- its newest ProofPack's status.

Never the content. The function runs as the caller (security invoker), so Row Level Security limits it to the person's workspaces. It covers at most 90 days and 300 changes; Settings asks for 30.

**Labelled as a prediction.** The record is titled "Replay of the last 30 days" and badged "Predicted from past changes", dashed like other simulated results. It says what it assumed: whether a verified sandbox was connected when each change was made can't be known now, so today's answer is used, and it says so. The desktop agent's changes are left out and counted, since level 2 never applies them. Nothing is applied or changed.

**Same plan as shadow mode:** Pro and up, and the trial. The demo workspace says it has no past changes.

## Consequences

- An owner can try different limits against real history in seconds, then rehearse or turn level 2 on.
- One read per replay, of shapes only.
- Replaying other policy changes, such as new sensitive-file rules, can use the same history.
