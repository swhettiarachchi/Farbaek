# Stage 98: The second check, with OpenAI

The spec audit found no second-checker model (spec §9). The owner added OpenAI API credit, so the second check uses OpenAI when the server has its key: a model from another company than the one that wrote the change.

- **Decision record:** `docs/adr/0121-second-check.md`.
- **Branch:** `feat/second-check` (from `main`).
- **Migration:** v75, `supabase/migrations/20261216090000_second_checks.sql`.

## 2026-10-30

### Done

- **`src/core/trust/second-check.ts`:** what the second model reads (contract, plan, policy, diffs within a budget), the answer's schema, clipping, accepting only real paths, choosing a checker, and when a check is recommended.
- **`src/server/ai/openai-second-checker.ts`:** OpenAI's Responses API over `fetch` with a strict schema and `store: false`, splitting cached tokens out of input.
- **`src/server/ai/second-checker.ts`:** the system prompt and the Claude checker.
- **`runSecondCheck`:** checks role, status, expiry and contract; prefers OpenAI, otherwise a different Claude model; meters as `second_check`, refunds failures, and records the result.
- **The rate card** has GPT-6.1 Terra at OpenAI's published prices.
- **The task page** has the **Second check** card: the result, a recommended note for escalated changes, **Ask a second model** / **Check again**, and plain advisory wording.
- **Activity** reads "asked a second model to check a change".
- **Privacy:** OpenAI listed as a processor, and its API terms stated in the Privacy Policy. `.env.example` and `set-secrets.ps1` know `OPENAI_API_KEY`.

### Verified

- `src/core/trust/second-check.test.ts` (6): the request with diffs; a file over budget sent by name; findings kept only on sent files; a different checker model; saying so when the only model also wrote it; when a check is recommended.
- `src/server/ai/openai-second-checker.test.ts` (4), against a labelled fake of OpenAI that never reaches the network:
  - the strict schema, `store: false`, and cached tokens split out of input;
  - over-long answers clipped;
  - refusal, cut-off, malformed, 429, 5xx, 401 and network failures;
  - the key read only from the environment.
- `src/server/workspace/second-check.test.ts` (5): OpenAI preferred and metered; another Claude model without it; the same-model case labelled; refunds on failure; refusals before any model call.
- `tests/db/second-checks.test.ts` (4): metered as `second_check`; one check per proposal, replaced, each audited; refusals record nothing; members read, only the server writes, and checks go with their proposal.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`.

### Not verified

- A real call to OpenAI: the key isn't on the server yet. Once the owner sets `OPENAI_API_KEY`, the first real check is the proof.

### Next

- The owner sets `OPENAI_API_KEY` (one PowerShell command); then Farbaek restarts the app and runs a real check on a pending change.
