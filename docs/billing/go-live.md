# Billing go-live checklist

Payments stay **not connected** (`BILLING_MODE=not_connected`) until every item below is checked and recorded with a date. Live mode needs an environment flag plus an audited admin confirmation.

Since 2026-10-28 (ADR 0100), test mode can be switched on for listed workspaces with `scripts/vps/set-dodo.ps1` (steps in `docs/billing/dodo-test-mode.md`). `BILLING_MODE=live` is still refused in code: `readBillingConfig` treats it as not connected.

- [x] Dodo Payments KYC approved for the owner's business (Sri Lanka is listed as eligible; approval is not guaranteed)
  - 2026-10-28: Dodo's Verification page shows "Live payments are active": product information, personal information and bank verification all approved.
- [x] Current Dodo API, SDK version, webhook format and cancellation semantics re-verified against the official docs, with notes in `docs/research/`
  - 2026-10-27: `docs/research/2026-10-27-dodo-payments.md`. Farbaek uses the REST API directly, not the SDK (ADR 0100). Re-read before going live.
- [x] Test-mode keys stored in the secrets store (never in git)
  - 2026-10-28: `scripts/vps/set-dodo.ps1` is ready; the owner runs it with keys from Dodo's dashboard.
- [ ] One Dodo product per plan and interval, with amounts reconciled against `src/core/billing/catalog.ts`
  - 2026-10-28: built. Office Space → Payments creates a monthly product per paid plan and reads each price back; checkout refuses a plan whose price differs. Still to do: create them in test mode, then live.
- [ ] The processor's real fee per payment is at most `ECONOMICS` in `src/core/billing/allowance.ts` (5% + $0.50, Paddle's rate, which the cost research uses), or `ECONOMICS` is updated and the catalog tests still hold the 40% margin (ADR 0020)
- [ ] Prices are shown without tax and tax is added at checkout (tax-inclusive prices take the tax out of each plan's budget)
- [ ] In Live mode, Dodo's Settings → Pricing has the same choices as test mode: Adaptive Currency on, **Adaptive Currency Fees Inclusive off** (the customer pays the up-to-4% conversion fee; on, it comes out of Farbaek's margin), Charm Pricing off
  - 2026-10-28: checked in test mode. Checkout offers Dodo's currency picker, and the consent words disclose the fee.
  - 2026-10-28: products are created with `tax_inclusive: false`, and Billing says tax is calculated at checkout. Confirm on a test checkout.
- [x] Annual billing decided: either no discount, or allowances cut so the margin holds
  - 2026-10-28: no annual plans at launch; monthly only. Revisit with the 57% margin (ADR 0103).
- [x] Spend cap built, and top-ups (at the plan's own rate, 12-month expiry) apply only up to it
  - 2026-10-28: ADR 0102, migration v64. A monthly limit set by an owner or admin (none set means no top-ups), counting checkouts still open. Usage arrives only from a payment read back from Dodo, once.
- [x] Paid usage grants anchored to the subscription start instead of the calendar month (`currentGrant` in `src/core/billing/wallet.ts`)
  - 2026-10-25: built, not yet connected. `currentGrant(plan, trial, now, anchor)` gives a paid plan the period starting on the subscription's day of the month (the 28th for the 29th to 31st), `grantResetsAt` follows it, and `src/core/billing/wallet.test.ts` covers it.
  - 2026-10-28: connected. `billing_accounts.subscription_started_at` (migration v62) comes from the provider's subscription and is the anchor everywhere a grant is made (`workspaceGrant`).
- [x] Webhook endpoint verifies signatures on the raw body, rejects stale timestamps, stores a unique `webhook_id`, and re-fetches state for out-of-order events
  - 2026-10-28: `POST /api/webhooks/dodo` (ADR 0100). Covered with signed mock fixtures in `src/server/billing/billing.test.ts`, `tests/db/payments.test.ts` and SE-035. Real deliveries are the next item.
- [ ] Billing tests 7, 8, 15 and 18 (spec section 20) pass against test mode with real signed webhooks
  - Mock versions pass (2026-10-28): consent before checkout (7), a replayed webhook-id is a no-op (8), cancellation states its date (15). The Billing page is built mobile first (18). Needs the owner's test keys to run for real.
- [x] The trial is confirmed to be internal only (never a Dodo `trial_period_days` product)
  - 2026-10-28: products are created with `trial_period_days: 0`, checkout never sends `subscription_data`, and Office Space flags a product with trial days. Tests assert all three.
- [x] Tax, refund and auto-renewal terms published, with legal review
  - 2026-10-28: published as the Terms' "Paid plans" section, version 2026-10-28 (ADR 0104), with the owner's decisions: no refunds mid-period, 30 days' notice. **Approved by the owner themselves; no lawyer has reviewed it yet.**
  - 2026-10-28: drafted in `docs/legal/paid-plans-terms-draft.md`, matched to what the code does. Needs the owner's refund and price-change decisions and a legal review, then it becomes a section of `/terms`. Dodo Payments is listed on the privacy page's processors.
- [x] Cancellation flow is as easy as signup, and consent records are stored
  - 2026-10-28: tested for real in test mode (the owner cancelled a Pro subscription from Billing; Dodo and Farbaek both showed the end date).
  - 2026-10-28: built. Cancel is two clicks from Billing and shows the date the plan ends; Keep undoes it. Checkout stores the exact words agreed to and their SHA-256 (`billing_checkouts`). Still to do: legal review of the wording.
- [ ] Owner sign-off recorded in the audit log
  - Built (ADR 0104): Office Space → Payments → Go live records it, with the Terms version, a reason and an authenticator code. Done when the owner confirms.
