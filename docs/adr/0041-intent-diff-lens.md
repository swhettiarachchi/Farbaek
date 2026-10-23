# ADR 0041: The Intent Diff Lens

- Status: accepted (2026-10-23).
- Spec: §25, the innovation backlog's MVP item "Intent Diff Lens".

## Context

An agent's diff is hard to review against what was asked. Farbaek's review shows the plan, the policy outcome and each file as a diff with accept and reject per chunk, and `checkProposal` flags whole files outside the contract's paths. Nothing tied each change within a file to the contract's clauses.

The spec asks for more:
- every hunk annotated with the clause it satisfies, or flagged as unexplained scope;
- the deterministic check first;
- hunks outside the allowed paths always flagged, whatever any mapping says.

## Decision

### Hunks

`diffLines` (`src/core/realityloop/line-diff.ts`) splits each change into hunks with Myers' algorithm, after trimming the common start and end. Files over 5,000 lines on a side, or over 2,000 edits apart, become one hunk, so the work stays small in the browser. A randomized test checks that applying the hunks always rebuilds the new file.

### Reading each hunk against the contract

`lensForChange` (`src/core/realityloop/intent-lens.ts`) reads each hunk in two steps.

**1. Exact flags.** These are never overridden:
- **Outside the contract's paths:** the file isn't under `pathScope`.
- **Operation not allowed:** the contract's allowed or forbidden operations, through the same `checkActionAgainstContract` the policy uses.
- **Touches a protected field:** a changed line names one of `protectedFields` as a whole identifier. `price` matches; `priceLabel` doesn't.

**2. A pointer.** The acceptance criterion, or the outcome, whose distinctive words the hunk shares:
- words are taken from the hunk's lines, its file path and the agent's reason for the file;
- camelCase and snake_case are split, a light stem is applied, and common prose words and code keywords are dropped;
- a pointer needs two shared words, or one specific word of seven letters or more;
- the shared words are shown, so the reviewer can judge.

**Unexplained.** A hunk with no flag and no pointer is marked "No contract clause explains this change": a soft flag asking a person to look.

### On the review

- **At the top,** a summary line: how many changes, how many match a clause, how many no clause explains, how many are flagged.
- **Above each file's diff,** one row per hunk ("Lines 12 to 18") with chips. Every chip has an icon and words, not colour alone:
  - flags in the failed tone;
  - pointers outlined in the verified tone;
  - unexplained dashed in the approval tone.
- **On phones,** the rows stack.
- **The copy says what this is:** flags are exact, while pointers only show shared words.

### Advisory, not a gate

The lens doesn't change approval. The server's policy (`evaluateChangePolicy` with `checkProposal`) still decides what is blocked or escalated, and it already covers paths and operations. The lens shows the reviewer the same rules at the level of each change, plus pointers.

## Consequences

- Reviewers see, per change, whether it's within scope and which part of the request it serves, so unexplained additions stand out.
- **Pointers can be wrong.** Shared words aren't understanding, and a change can serve a criterion without sharing its words. The spec's "AI suggestion" step, a model mapping each hunk to a clause and recording it, can come later. The deterministic part stays first and authoritative.
- **Invariants written in words** ("prices never change") still need a person. The review already lists them.
