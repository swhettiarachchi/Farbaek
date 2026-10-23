# Stage 17: AI suggestions in the Intent Diff Lens

The spec's MVP item "Intent Diff Lens" maps each hunk to the contract "via file globs and AI suggestion, with the deterministic check first". Stage 14 built the exact checks and a word pointer; this stage adds the AI suggestion, on request.

- **Plan:** approved 2026-10-23.
- **Decision record:** `docs/adr/0044-lens-ai-suggestions.md`.
- **Branch:** `feat/lens-ai`, from `main`.

## 2026-10-23

### Done

**Migration v29** (`20261031090000_lens_suggestions.sql`):
- the ledger accepts `lens_mapping`;
- `proposal_lens_suggestions` holds one mapping per proposal; members read it, and only the server writes it;
- `app_record_lens_suggestion` is for contributors, while the proposal is pending, and it's audited.

**The logic:** `src/core/realityloop/lens-suggestion.ts`:
- `lensRequest`: the clauses, and each hunk with its lines, reason and flags;
- `LensSuggestionSchema`;
- `acceptSuggestion`, which keeps only hunks that were sent and clauses that exist;
- `withSuggestion`, which puts the AI view beside each hunk and changes nothing else.

**The call:**
- `src/server/ai/lens-mapper.ts`: Claude, structured output, adaptive thinking at low effort, on the cheap tier.
- `src/server/workspace/lens-suggestions.ts`:
  - checks the person, that the proposal is pending, its window and the contract version;
  - reserves `lens_mapping` usage, then settles it, or refunds it on failure or refusal;
  - stores the validated mapping.
- **The action** is `suggestLensMappingAction`.
- **Availability:** `loadAiAvailability` knows `lens_mapping`, which is Claude only.

**The review:**
- the lens summary offers "Ask AI to map each change" (or "Ask again"), with its reason when unavailable;
- once there's a mapping, it names the model and the time;
- each hunk gets an "AI · clause · reason" chip in its own style.

**The demo:** the demo proposal has a labelled sample mapping, from no model call.

**Docs:** the operation is in `docs/billing/usage.md`.

### Verified

- **`tests/db/lens-suggestions.test.ts`** (4 tests):
  - the ledger accepts `lens_mapping`;
  - one mapping per proposal, replaced when asked again, each audited;
  - other workspaces, viewers, closed proposals and malformed mappings are refused;
  - members read only their own workspace's, only the server writes, and it goes with its proposal.
- **`lens-suggestion.test.ts`** (6 tests):
  - the request's shape;
  - the cuts and the cap on hunks;
  - unknown hunks and clauses and duplicate answers are dropped;
  - "none" is kept;
  - an out-of-scope hunk keeps its flag when the AI maps it to a clause (the spec's acceptance).
- **`lens-suggestions.test.ts`** (3 tests, a fake model):
  - reserve, then settle, then store only valid mappings;
  - a refusal or an error is refunded and stores nothing;
  - viewers, closed or expired proposals and a changed contract are refused before any model call.
- **The full suite:** `pnpm typecheck` and `pnpm lint` are clean. `pnpm test`: 1,168 passed, 14 skipped.
- **In the browser,** on a demo build, with demo task b007:
  - the lens summary says "AI mapping by sample (no model call), 1 hour ago. Each AI chip is a suggestion, not a check; the flags above it still stand.";
  - "Ask again" is unavailable, with the demo's reason;
  - `cart.ts` line 9 shows the word pointer "AC-1 · Adding a fractional quantity throws a clear error." with "AI · AC-1 · The guard now throws for 1.5…" below it;
  - the test's hunk keeps its word pointer to the outcome, with the AI chip mapping it to AC-1;
  - at 375px the chips wrap to full text, the button is 44px tall, and nothing scrolls sideways.
- **Not run:** a real model call. It spends real AI usage, so it waits for the owner's go-ahead on a signed-in workspace.

### Next

- Map automatically on each new proposal, as a per-workspace setting, once real costs are known.
