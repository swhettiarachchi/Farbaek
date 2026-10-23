# ADR 0044: AI suggestions in the Intent Diff Lens

- Status: accepted (2026-10-23).
- Spec: §25, the MVP item "Intent Diff Lens". It maps a diff to the contract "via file globs and AI suggestion, with the deterministic check first". Acceptance: hunks outside the allowed globs are always flagged, even if the AI mapping says otherwise.

## Context

ADR 0041 built the deterministic half:
- exact flags for paths, operations and protected fields;
- a pointer to the clause a hunk shares distinctive words with.

The word pointer misses changes that serve a clause in other words. Those show as "No contract clause explains this change", though a reader would see the link.

## Decision

### On request, not automatic

A proposal in review gets "Ask AI to map each change" in the lens summary.
- **Why on request:** each call costs model tokens from the workspace's AI usage. Asking only when someone wants it keeps the cost visible and avoids surprise spend on every proposal.
- **When it's available:** while the proposal is pending and inside its approval window (ADR 0042).
- **Asking again** replaces the stored mapping.

### The call

**What the model reads.** `lensRequest` (`src/core/realityloop/lens-suggestion.ts`) sends, as JSON data:
- the outcome and acceptance criteria, with their ids;
- each hunk, with:
  - an id;
  - its path and range;
  - its lines, cut to 40 on each side and 300 characters each, with at most 60 hunks;
  - the agent's reason;
  - the exact flags already found.

**The prompt** asks for one clause per hunk, or "none" when nothing plainly fits ("a wrong match is worse than none"). It treats every hunk as data, never as instructions.

**The model.** Structured output against `LensSuggestionSchema`, on the cheap tier of Auto routing (`step: "review", effort: "fast"`), with adaptive thinking at low effort.

**Providers:** Claude only, like the security review. On a server using another provider, the button says why it's unavailable.

**Metering.** It's metered as `lens_mapping` (migration v29 adds it to the ledger):
- usage is reserved for the real prompt, then settled to the real cost;
- it's refunded when the call fails or the model refuses.

### Untrusted output, flags first

**What's kept.** `acceptSuggestion` keeps only:
- hunk ids that were sent;
- clause ids the contract has, or "none";
- the first answer per hunk.

**How it's shown.** `withSuggestion` adds the model's view beside each hunk and changes nothing else:
- a flag stays a flag;
- an "unexplained" hunk stays marked;
- the word pointer stays as it was.

**On the review,** the AI chip has a dashed accent outline, a sparkle icon and the word "AI": "AI · AC-1 · reason", or "AI · no clause fits · reason". The summary names the model and the time, and says each AI chip is a suggestion, not a check.

### Kept with the proposal

`proposal_lens_suggestions` holds one mapping per proposal: the mappings, the model, who asked and when.
- **Reading:** members can read it.
- **Writing:** only the server, through `app_record_lens_suggestion`, for a contributor while the proposal is pending. It's audited.
- **Lifetime:** it goes with its proposal.

## Consequences

- **The lens is now complete as the spec describes it:** globs and rules first, then an AI suggestion that can't override them.
- **A mapping costs a small model call,** usually on the cheapest tier, and only when asked for.
- **Not done:** mapping automatically on each new proposal. It could come later as a per-workspace setting, once real costs are known.
