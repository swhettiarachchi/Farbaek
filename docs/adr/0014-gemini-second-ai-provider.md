# 0014. Gemini as a second AI provider

- Status: accepted
- Date: 2026-10-17
- Extends ADR 0009 (contract drafting with Claude).

## Context

The owner has keys for both Claude (Anthropic) and Gemini (Google AI Studio, free tier) and asked for both to be set up. AI features already sit behind two provider interfaces (`ContractDrafter`, `ChangeProposer`), with Claude as the only implementation.

## Decision

- **Add a Gemini adapter** (`src/server/ai/gemini.ts`) for both interfaces, calling the official Gemini API REST endpoint `models.generateContent` with `fetch`. No SDK dependency.
- **Default model `gemini-3.8-flash`**: stable, on the free tier, recommended by Google for new projects (Gemini API models and pricing pages, 2026-10-17). `GEMINI_MODEL` overrides it.
- **Same rules for both providers**: prompts and message builders moved to `src/server/ai/prompts.ts`; outputs from either provider are validated against the same Zod schemas and only prefill forms or proposals for a person to review; the same AI credits are reserved, settled or refunded.
- **Structured output**: JSON mode with a JSON Schema reduced to the subset the Gemini API documents. If the API rejects the schema field, one retry in plain JSON mode with the schema stated in the instructions. Off-schema output is `INCOMPLETE`, never used.
- **Provider choice**: `AI_PROVIDER=anthropic|gemini`; unset, Claude when its key is set, otherwise Gemini. No automatic switch to the other vendor on errors, so project data only goes to the provider the server is configured for.
- **Keys**: read from the server environment only; the Gemini key is sent in the `x-goog-api-key` header, never in a URL. `pnpm setup:env` (type `ai`) takes both keys with hidden input; `pnpm check:env` confirms each without printing it.

## Consequences

- On Google's free tier, prompts and responses may be used by Google to improve its products (Gemini API pricing page); drafting sends task titles, project details, notes and, for proposals, selected file contents. The setup prompt and `.env.example` say so. A paid Gemini tier, or Claude, avoids this.
- Gemini's refusal handling differs from Claude's server-side fallback: safety blocks come back as `REFUSED` without a fallback model.
- Not yet run live: the adapter is tested against a fake HTTP layer; the first live draft confirms it.
