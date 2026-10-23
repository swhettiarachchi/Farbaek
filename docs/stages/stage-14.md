# Stage 14: the Intent Diff Lens

The spec's backlog (§25) lists the Intent Diff Lens as an MVP item: every hunk of an agent's change annotated with the contract clause it serves, or flagged as unexplained, with the deterministic checks first.

- **Plan:** approved 2026-10-23.
- **Decision record:** `docs/adr/0041-intent-diff-lens.md`.
- **Branch:** `feat/intent-lens`, from `main`.

## 2026-10-23

### Done

- `src/core/realityloop/line-diff.ts`: Myers line diff into hunks, with limits.
- `src/core/realityloop/intent-lens.ts`:
  - exact flags (outside the contract's paths, an operation it doesn't allow, a protected field named on a changed line);
  - a pointer to the acceptance criterion or outcome the hunk shares distinctive words with;
  - "unexplained" otherwise;
  - a summary.
- The review shows a summary and, above each file's diff, a row per hunk with chips. The task page passes the contract to the review.

### Verified

- `line-diff.test.ts` (7 tests): edits, inserts, deletes, separate hunks, new files and the size limits; 50 scrambled pairs where the hunks always rebuild the new file.
- `intent-lens.test.ts` (8 tests):
  - pointers to the outcome and to AC-2;
  - an out-of-scope file stays flagged even when its words match (the spec's acceptance test);
  - a disallowed operation is flagged;
  - a protected field is flagged, but not inside a longer name;
  - common words alone don't match;
  - the summary counts;
  - word splitting and range wording.

### Next

- An AI suggestion step that maps each hunk to a clause and records it with the proposal, shown beside the word pointer.
