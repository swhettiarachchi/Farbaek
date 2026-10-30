# Stage 93: Honest claims, and Context Readiness

The owner asked whether every part of the platform was built. A section-by-section audit against the master spec (`docs/architecture/spec-audit-2026-10-30.md`) found most of it built. It also found missing parts, and three homepage claims that weren't true. This stage fixes the claims and builds the first missing part, Context Readiness (spec §8).

- **Decision record:** `docs/adr/0116-context-readiness.md`.
- **Branch:** `feat/honest-claims-context-readiness`.

## 2026-10-30

### Done

- **The audit,** with each spec section marked built, partly built or not built, plus what isn't yet proven live.
- **The homepage** no longer claims a visual builder or permission leases. "Context readiness" is back now that it's built.
- **Context Readiness** (`src/core/realityloop/context-passport.ts`): facts from the project's real records, each verified current, possibly stale, conflicting, inferred, missing or not visible, with sources. It also gives a readiness verdict and next steps.
- **The task page:** the Context readiness card, and the Context Passport as a JSON download.
- **The plan drafter and the agent** both receive the facts and are told how to treat each status.

### Verified

- `src/core/realityloop/context-passport.test.ts` (9):
  - ready when everything checks out;
  - a check whose script is missing;
  - files changed after approval and after the last checks;
  - contradictions kept as such;
  - not ready without a plan or with impossible scope;
  - variable names without values;
  - static and empty projects;
  - the worst news first;
  - reading a check's script.
- `src/server/ai/prompts.test.ts` (2) and an opening-message test in `src/agent-runtime/loop.test.ts`.
- **In a demo dev server:**
  - the card shows on the six unfinished demo tasks;
  - it found the demo's missing lockfile and a check that runs a `typecheck` script package.json doesn't define;
  - no sideways scroll at 375px;
  - the passport downloads as JSON, and the empty demo task is "Not ready" with the right next step.
- `pnpm typecheck`.

### Next

- From the audit, in order: permission leases (spec §9), then the rest of the "not built" list.
