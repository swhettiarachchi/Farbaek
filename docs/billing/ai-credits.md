# AI credits

The allowance comes from the plan catalog (`aiCreditsPerMonth` in `src/core/billing/catalog.ts`; 100 in total for the trial). What each operation costs lives in `src/config/credits.ts`. This page and that file must agree.

## Operations

| Operation | Key | Credits | What it does |
| --- | --- | --- | --- |
| Draft an intent contract | `contract_draft` | 1 | One model call that fills the contract editor from the task. Nothing is saved until a person saves it. |
| Propose a change | `change_proposal` | 3 | One model call that plans targeted edits to the files a person chose. Nothing is applied until a person approves it. |

## Rules

- **Period.** During the trial, the whole trial window. Otherwise the UTC calendar month. Paid plans will anchor to the subscription start once payments exist.
- **Reserve, then settle.** Credits are reserved before the model is called. `app_reserve_ai_credits` re-checks the allowance under a row lock on the organization, so the balance never goes negative.
- **Refunds.** A call that returns nothing usable is refunded: the provider was busy or failed, the output was cut off or didn't match the schema, or the model (and its fallback) declined. A proposal is also refunded when none of its changes can be applied, or when a file changed while it was being made.
- **Usage records.** Each ledger row keeps the model that answered and the provider-reported input and output tokens, and no prompts or outputs. Separately, a change proposal keeps its plan and proposed file contents for review and audit (ADR 0011). Contract drafts are kept only if a person saves them.
- **What counts.** Reserved and settled rows count. Refunded rows don't.
- **Fail closed.** If usage can't be read, AI drafting is off. If settling fails after a successful draft, the credit stays counted.
- **Billing.** Credits aren't sold and nothing is charged for them. Model usage is paid by the server's Anthropic key.

## Where it's enforced

- TypeScript: `reserveCredits`, `refundAndFail` and `aiAvailability` in `src/server/workspace/ai-credits.ts`, used by `ai-drafting.ts` and `proposals.ts`.
- Database: `supabase/migrations/20261015090000_ai_credit_ledger.sql`, operations extended in `20261015150000_change_proposals.sql` (tests in `tests/db/ai-credits.test.ts` and `tests/db/change-proposals.test.ts`).
