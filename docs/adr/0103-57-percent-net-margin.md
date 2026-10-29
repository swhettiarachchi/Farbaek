# ADR 0103: A 57% net margin after Dodo Payments' worst-case fees

- Status: accepted (2026-10-28). Replaces ADR 0020's 40% margin and its Paddle fee assumption; ADR 0020's single formula stays.
- The owner's decision: "my net profit should be 57% from everything, after cut out our all services fees and other payments".

## Context

ADR 0020 set every plan's allowance from one formula, with a 40% margin after Paddle's 5% + $0.50. Payments now go through Dodo Payments (ADR 0100). Its fees, per dodopayments.com/pricing (read 2026-10-28):
- 4% + 40 cents per card or wallet payment;
- +1.5% for cards outside the US, +0.5% for subscriptions, +3% for PayPal, Klarna or Afterpay;
- payouts: free; $5 under $1,000; $25 by USD SWIFT for a non-US business.

## Decision

- **Margin and fee:** `ECONOMICS.margin` is 0.57, and the fee is Dodo's **worst case, 9% + $0.40**, so the margin holds whatever the customer pays with.
- **The budget:** each plan's cost budget is 0.34 × price − $0.40. Out of it come, as before: the fixed share (now the server, email, domains and the $25 payout), snapshots, the plan's sandbox hours and the 5% free-retry reserve. AI usage gets the rest.
- **Not costs to Farbaek:** tax is added at checkout, and the conversion fee is the customer's (Fees Inclusive off, ADR 0100), so neither comes out of the price.
- **Prices don't change; allowances do.** Every plan's AI usage is about half of what it was. In typical Sonnet sessions a month:
  - Starter 9 → 4, Plus 22 → 11, Pro 60 → 32, Studio 98 → 53;
  - Max 123 → 68, Max 2x 250 → 138, Max 3x 376 → 209.
- **The trial** keeps Starter's AI usage, now 16,070 units.
- **Top-ups** add usage at the plan's own rate, which keeps 57% at the worst-case fee for a one-time payment.
- **The catalog version stays** `2026-10-18.1`: prices and the Dodo products are unchanged, and no paying customer exists yet (test mode only).

## Consequences

- **Tests:** `catalog.test.ts` checks the new budgets, a 57% floor for every plan fully used, and the same floor for every top-up pack on every plan.
- **What people see:** pricing cards and Billing show the smaller session estimates automatically.
- **Not included:** the free plan ($0.50 of AI a month) and trials come out of the margin as customer acquisition. The overall margin also depends on how many free and trial users there are per paying subscriber.
- **Before live payments:** existing subscribers would need notice of any allowance change. There are none yet.
