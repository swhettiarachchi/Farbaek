# AI credits

The allowance comes from the plan catalog (`aiCreditsPerMonth` in `src/core/billing/catalog.ts`; 100 in total for the trial). What each operation costs lives in `src/config/credits.ts`. This page and that file must agree.

## Operations

| Operation | Key | Credits | What it does |
| --- | --- | --- | --- |
| Draft an intent contract | `contract_draft` | 1 | One model call that fills the contract editor from the task. Nothing is saved until a person saves it. |

## Rules

- **Period.** During the trial, the whole trial window. Otherwise the UTC calendar month. Paid plans will anchor to the subscription start once payments exist.
- **Reserve, then settle.** Credits are reserved before the model is called. `app_reserve_ai_credits` re-checks the allowance under a row lock on the organization, so the balance never goes negative.
- **Refunds.** A call that returns no draft is refunded: the provider was busy or failed, the output was cut off or didn't match the schema, or the model (and its fallback) declined.
- **Usage records.** Each ledger row keeps the model that answered and the provider-reported input and output tokens. No prompts or outputs are stored.
- **What counts.** Reserved and settled rows count. Refunded rows don't.
- **Fail closed.** If usage can't be read, AI drafting is off. If settling fails after a successful draft, the credit stays counted.
- **Billing.** Credits aren't sold and nothing is charged for them. Model usage is paid by the server's Anthropic key.

## Where it's enforced

- TypeScript: `draftContractWithAi` and `aiDraftAvailability` in `src/server/workspace/ai-drafting.ts`.
- Database: `supabase/migrations/20261015090000_ai_credit_ledger.sql` (tests in `tests/db/ai-credits.test.ts`).
