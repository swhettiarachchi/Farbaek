# Billing go-live checklist

Payments stay **not connected** (`BILLING_MODE=not_connected`) until every item below is checked and recorded with a date. Live mode needs an environment flag plus an audited admin confirmation.

- [ ] Dodo Payments KYC approved for the owner's business (Sri Lanka is listed as eligible; approval is not guaranteed)
- [ ] Current Dodo API, SDK version, webhook format and cancellation semantics re-verified against the official docs, with notes in `docs/research/`
- [ ] Test-mode keys stored in the secrets store (never in git)
- [ ] One Dodo product per plan and interval, with amounts reconciled against `src/core/billing/catalog.ts`
- [ ] The processor's real fee per payment is at most `ECONOMICS` in `src/core/billing/allowance.ts` (5% + $0.50, Paddle's rate, which the cost research uses), or `ECONOMICS` is updated and the catalog tests still hold the 40% margin (ADR 0020)
- [ ] Prices are shown without tax and tax is added at checkout (tax-inclusive prices take the tax out of each plan's budget)
- [ ] Annual billing decided: either no discount, or allowances cut so the 40% margin holds
- [ ] Spend cap built, and top-ups (at the plan's own rate, 12-month expiry) apply only up to it
- [ ] Paid usage grants anchored to the subscription start instead of the calendar month (`currentGrant` in `src/core/billing/wallet.ts`)
- [ ] Webhook endpoint verifies signatures on the raw body, rejects stale timestamps, stores a unique `webhook_id`, and re-fetches state for out-of-order events
- [ ] Billing tests 7, 8, 15 and 18 (spec section 20) pass against test mode with real signed webhooks
- [ ] The trial is confirmed to be internal only (never a Dodo `trial_period_days` product)
- [ ] Tax, refund and auto-renewal terms published, with legal review
- [ ] Cancellation flow is as easy as signup, and consent records are stored
- [ ] Owner sign-off recorded in the audit log
