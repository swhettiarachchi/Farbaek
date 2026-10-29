# AI usage and the usage wallet

Internal reference (ADR 0020). People never see units: they see the share of this period's usage used, when it resets, what carried over and when it expires (ADR 0019). Prices and allowances come from `src/core/billing/catalog.ts`; this page and the code must agree.

## The unit

1 unit = $0.0001 of provider list cost. Every AI call is metered at its real token usage, priced by `src/core/billing/rate-card.ts`:

| Model | Input | Output | Cache write | Cache read | Notes |
| --- | --- | --- | --- | --- | --- |
| Claude Haiku 5.5 | $0.10 | $0.50 | $0.125 | $0.01 | 5x for any request whose prompt is over 100K tokens |
| Claude Sonnet 5.5 | $2 | $10 | $2.50 | $0.10 | |
| Claude Opus 5.5 | $4 | $20 | $5 | $0.20 | |
| Claude Fable 5.1 | $10 | $50 | $12.50 | $0.25 | |
| Gemini 3.5 Flash-Lite | $0.30 | $2.50 | | $0.03 | |
| Gemini 3.8 Flash | $1.50 | $7.50 | | $0.15 | 2027 price (doubles 2027-01-01) |
| Gemini 4 Argon | $4 | $20 | | $0.20 | December price (doubles 2026-12-01) |

USD per million tokens, list prices retrieved 2026-10-18 (sources in `reports/AI coding platform costs and pricing.md`). A model id the rate card doesn't know is priced as Fable, so nothing is under-metered. Gemini is listed at its announced higher prices so allowances stay profitable when they land.

## Allowances

`src/core/billing/allowance.ts` turns a price into an allowance, so plans can't drift from the research:

- Cost budget = 0.34 × price − $0.40. That keeps a **57% net margin** (ADR 0103) after Dodo Payments' worst-case fee of 9% + $0.40: 4% + 40 cents, +1.5% for cards outside the US, +0.5% for subscriptions, and +3% for PayPal or Klarna. Tax and the currency conversion fee are paid by the customer on top.
- Minus the fixed share ($0.40 a month: about $80 of server, email, domain and payout costs, including Dodo's $25 SWIFT payout, over an assumed 200 subscribers), snapshot storage ($0.16 for 2 GB) and sandbox time ($0.149 an hour × the plan's hours).
- 5% of what's left is held back for free retries. The rest is the AI allowance.

| Plan | Price | AI units a month | Retry reserve | Sandbox hours | About this many Sonnet sessions |
| --- | --- | --- | --- | --- | --- |
| Free | $0 | 5,000 (about $0.50) | none | 1 | 1 |
| Lite yearly | $0.99 ($11.88 a year, ADR 0105) | 7,532 | none | 1 | 2 |
| Maker yearly | $1.99 ($23.88 a year, ADR 0105) | 9,220 | 222 | 2 | 2 |
| Lite (monthly, on the cards) | $0.99 a month (about 45.5% margin, accepted by the owner) | 5,000 (Free's) | none | 1 | 1 |
| Maker (monthly, on the cards) | $1.99 a month | 5,737 | 38 | 2 | 1 |
| Starter | $9.99 | 16,070 | 845 | 5 | 4 |
| Plus | $19.99 | 41,292 | 2,173 | 10 | 11 |
| Pro | $50 | 116,992 | 6,157 | 25 | 32 |
| Studio | $79.99 | 192,627 | 10,138 | 40 | 53 |
| Max | $100 | 243,105 | 12,795 | 50 | 68 |
| Max 2x | $200 | 495,330 | 26,070 | 100 | 138 |
| Max 3x | $300 | 747,555 | 39,345 | 150 | 209 |
| Enterprise | Custom | by contract | by contract | by contract | |

The trial gets Pro's features with Starter's AI usage (16,070 units across the 14 days) and 2 sandbox hours. Top-ups (ADR 0102) add usage at the plan's own rate, which keeps 57% even at the worst-case fee on a one-time payment (`catalog.test.ts`).

## The wallet

- **Grants.** Usage lives in `usage_grants`. Each period issues one grant, on its first use (`src/core/billing/wallet.ts`, `currentGrant`):
  - Paid plans: the calendar month (until payments set a subscription anchor), lasting one more month as rollover. Source key `plan:<plan>:<YYYY-MM>`.
  - Free: the calendar month, no rollover. Key `free:<YYYY-MM>`.
  - Trial: the whole trial. Key `trial:<start>`.
  - Top-ups (later, with payments) and adjustments are inserted by Farbaek only.
  The database refuses a grant longer than 70 days or with a key that doesn't match its kind.
- **Spending order.** Soonest expiry first, so carried-over usage goes before this month's. Each ledger entry records which grants it drew from.
- **Reserve, then settle.** Before a call, `app_reserve_usage` reserves its whole prompt plus the most it can write (`reserveUnits`), under the organization lock, and refuses with `QUOTA_EXCEEDED` if the grants don't hold that much. After the call, `app_settle_usage` settles to the real cost and gives the rest back to the same grants. A call that cost more than reserved draws the difference if there's room; anything beyond is absorbed by Farbaek.
- **Refunds.** A call that returns nothing usable is refunded in full (`failed`): the provider was busy or failed, the output was cut off or didn't match the schema, or the model and its fallback declined. A proposal is also refunded when none of its changes can be applied, or when a file changed while it was being made. `stopped` is for runs Farbaek stops on its own side. The real cost is still recorded on the entry for Farbaek's own accounts.
- **Top-ups** (ADR 0102). Paid plans can buy $10, $25 or $50 of usage at the plan's own rate. That's a `topup` grant, lasting 12 months and drawn after plan usage, never past the monthly limit an owner or admin sets.
- **Free retries.** `free_retry` refunds come from the plan's retry reserve: the database sums them over the last 31 days under the lock and refuses with `RETRY_CAP` past the reserve, and the server then settles normally (`settleAsFreeRetry`). Since 2026-10-28 (ADR 0101) a fix started from a task whose checks failed uses them: when the fix's own checks fail too, `app_refund_fix_task` gives back its settled entries, whole entries only, within the same 31-day cap, once (`src/server/workspace/fix-retry.ts`). `settleAsFreeRetry` remains for refunding a call as it settles.
- **Spend cap.** Shown on Billing as unavailable until payments are connected. Until then nothing can be billed.
- **Fail closed.** If billing state or the wallet can't be read, AI is off. If settling fails after a success, the reservation keeps counting.

## Operations

`src/config/usage.ts` lists them; the ledger accepts only these:

| Operation | Key | What it does |
| --- | --- | --- |
| Draft an intent contract | `contract_draft` | One model call that fills the contract editor from the task. Nothing is saved until a person saves it. |
| Propose a change | `change_proposal` | One model call that plans targeted edits to the files a person chose. Nothing is applied until a person approves it. |
| Agent step | `agent_step` | Reserved for cloud agent runs (Phase 2). |
| Security review | `security_review` | Reserved for security checks (Phase 4). |
| Model call from an agent | `model_gateway` | Reserved for the model gateway the desktop agent will use (Phase 2). |
| Map a change to its contract | `lens_mapping` | One model call, asked for on a proposal in review, that names the contract clause each change serves (ADR 0044). Refunded if it fails or is refused. |
| Draft a workspace rule | `policy_draft` | One model call on the Policies page that turns a person's description into draft rules (ADR 0082). It only fills the builder; nothing applies until a person tests and activates the rules. Refunded if it fails or is refused. |

## A run's own cap (ADR 0040)

Before a cloud agent run starts, the plan card shows its estimate and a cap: **the estimate** (its top), **twice that** (the default), or **no run cap** (the plan's allowance still applies).

- **How it's set:** the server works out the cap in units from the workspace's plan; the browser only sends which choice.
- **How it's enforced:** before each model step, the gateway prices the step's worst case and refuses the step, before reserving or calling anything, unless it fits in what's left. The worst case is every input token written to the cache, plus 25%, and the step's full output allowance. Settled steps are added up at their real cost; refunded steps count as nothing.
- **What's estimated:** input tokens are counted approximately before a step (about 3 characters a token). The 25% margin covers that. The cap holds as long as the count is within it.
- **What happens at the cap:** the run stops before the step that might pass the cap. Any files the agent changed become a proposal marked partial, kept for review; once applied, Keep going carries on from it. Runs that reach the fixed step, token or time limits keep their work the same way.

## Where it's enforced

- TypeScript: `reserveUsage`, `settleUsage`, `refundAndFail`, `settleAsFreeRetry` and `aiAvailability` in `src/server/workspace/ai-usage.ts`, used by `ai-drafting.ts` and `proposals.ts`. The wallet view is `walletView` in `src/core/billing/wallet.ts`.
- Database: `supabase/migrations/20261018180000_plans_and_wallet.sql` (tests in `tests/db/ai-credits.test.ts`). The ledger table is still named `ai_credit_ledger`; its `credits` column now holds units.
- Usage records keep the model that answered and the provider-reported input, output and cache tokens, and no prompts or outputs.
