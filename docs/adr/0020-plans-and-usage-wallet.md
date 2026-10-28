# 0020. Eight plans priced from costs, and a usage wallet

> Updated by ADR 0103 (2026-10-28): the margin is now 57%, after Dodo Payments' worst-case 9% + $0.40.

- Status: accepted
- Date: 2026-10-18
- Updates: ADR 0009 and ADR 0011 (fixed credits per action), ADR 0019 (what pricing compares)

## Context

The owner wants Farbaek to be a complete platform on its own models: no API keys to bring, one subscription. Plans at $9.99, $19.99, $50, $79.99, $100, $200 and $300, plus Enterprise (custom), with 40% profit, and with the money people pay working harder for them than elsewhere.

The cost research (`reports/AI coding platform costs and pricing.md`, cited and dated 2026-10-18) found:
- model tokens dominate costs;
- Paddle is the processor that works for a Sri Lanka-based seller, at 5% + $0.50;
- Gemini prices rise in December and January;
- competitors with their own models give more raw usage per dollar, but none combine rollover, no charge for failed attempts, and sandboxes and checks on the cheaper plans.

The old system metered fixed credits per action (1 for a contract draft, 3 for a proposal), whatever the call really cost.

## Decision

- **Plans:** Free, Starter, Plus, Pro, Studio, Max, Max 2x, Max 3x and Enterprise (`src/core/billing/catalog.ts`, version `2026-10-18.1`). They replace Developer, Team and Business; no paid subscription existed, and migration 15 maps any old id. The trial carries Pro's features with a month of Starter's AI usage.
- **One formula for every allowance** (`src/core/billing/allowance.ts`):
  - cost budget = 0.55 × price − $0.50;
  - minus a fixed-cost share, snapshot storage and the plan's sandbox hours;
  - minus a 5% hold-back for free retries;
  - the rest is AI usage.
  Tests check the margin holds even when a plan uses everything.
- **Metered at real cost.** A unit is $0.0001 of provider list cost (`src/core/billing/rate-card.ts`). Each call is priced from its reported input, output and cache tokens. An unknown model is priced as the most expensive one. Gemini is listed at its announced higher prices.
- **The usage wallet** (migration 15, `src/core/billing/wallet.ts`, `src/server/workspace/ai-usage.ts`):
  - each period issues a grant on first use; a paid plan's grant lasts one more month, so unused usage carries over;
  - spending draws from the grant that expires soonest, and each ledger entry records which grants it drew from;
  - a call reserves its whole prompt plus its longest possible answer under the organization lock, then settles to the real cost and returns the rest;
  - failed calls are refunded in full;
  - free retries come from the plan's hold-back, capped over 31 days in the database.
- **People still see shares, never units** (ADR 0019): this period's share used and when it resets, what carried over and when it expires, and each grant's share left on Billing. Pricing cards show "About N agent sessions a month", from Anthropic's published sample session with a 30% tokenizer uplift, labelled as guidance.
- **Not yet:**
  - The spend cap shows as unavailable until payments are connected.
  - Top-ups and annual billing wait for payments: an annual discount breaks the 40% unless allowances shrink, and that's a go-live decision.
  - Model routing per plan (fast models only on Free, Opus from Pro, Fable from Max 2x) arrives with the model gateway (ADR 0021).
- `src/config/credits.ts` becomes `src/config/usage.ts`, and `docs/billing/ai-credits.md` becomes `docs/billing/usage.md`.

## Consequences

- Prices and allowances change only through the catalog and the formula. A change to costs, such as a provider price change, is one edit to the rate card or `ECONOMICS`, and the tests show whether the margin still holds.
- A heavy call costs more than a light one, as it really does. The estimate only reserves room, so people never pay for a reservation.
- Reservations are conservative, sized for the longest possible answer. Near the end of an allowance, a big call can be refused while a small one still fits. The message says there isn't enough left "for this".
- The ledger table keeps its name (`ai_credit_ledger`). Its `credits` column now holds units, and the few old rows (1 to 3 credits each) read as a negligible number of units.
