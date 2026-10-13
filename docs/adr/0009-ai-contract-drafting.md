# 0009. AI contract drafting with Claude

- Status: accepted
- Date: 2026-10-15

## Context

Stage 2 needs AI to draft intent contracts from a task. Spec section 7 allows official provider SDKs, requires Farbaek to keep its own orchestration and permission rules, and says model cost must be disclosed. Section 14 adds that credits are defined in `config/credits.ts`, usage is provider-reported, balances never go negative, and runs that fail on a platform error are refunded.

## Decision

- **Provider:** Anthropic, through the official TypeScript SDK (`@anthropic-ai/sdk` 0.128.0). One server-side module, `src/server/ai/anthropic.ts`, behind a `ContractDrafter` interface. Use cases and tests depend on the interface, not the SDK.
- **Model:** `claude-opus-5-5` with adaptive thinking at medium effort. Output is capped at 8,000 tokens.
- **Structured output:** the response must match `ContractDraftSchema` (`src/core/realityloop/contract-draft.ts`). The schema has no length limits so a long item doesn't fail the whole call. `draftToForm` trims, bounds and de-duplicates, and keeps any operation that is both allowed and forbidden as forbidden.
- **Refusal fallbacks:** on, with `fallbacks: "default"` (beta header `server-side-fallback-2026-07-01`). When the model declines for policy reasons, the API retries on Anthropic's recommended fallback model in the same call. The model that answered is recorded in the ledger and shown in the editor. A refusal from the whole chain refunds the credit.
- **Untrusted input:** the task title, project details and the person's notes go to the model as JSON data, with a system prompt that says they're data, not instructions. The output only prefills the editor. A person still saves it through `contractFromForm` validation and approves the exact hash. The model never saves or approves.
- **Credits:** `CREDIT_COSTS.contract_draft = 1` in `src/config/credits.ts`. The ledger (`ai_credit_ledger`, migration 4) reserves before the call under a lock on the organization, settles with provider-reported tokens, and refunds when no draft came back. The period is the trial window during a trial, otherwise the UTC calendar month.
- **Privacy:** thinking is never returned to the browser or stored. The ledger stores the model name and token counts, not prompts or outputs.
- **Availability:** the button is shown everywhere the editor is, and is visibly unavailable with a reason when there's no `ANTHROPIC_API_KEY`, in the demo, for viewers, when billing state is unknown, or when credits are used up.

## Consequences

- Each draft is billed to the server's Anthropic key at Opus rates. Credits limit how many drafts a workspace can make; they are not a price.
- Swapping or adding a provider means another `ContractDrafter` implementation and an ADR. It must not silently send code to a new third party (spec section 7).
- If settling fails after a successful draft, the reservation keeps counting (fail closed). If a refund fails, the person is told the credit may still show as used.
- Bring-your-own-key isn't offered yet. When it is, the UI must say that usage is billed by the provider directly.
