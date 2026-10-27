# Paid plans: draft terms for review

**Status:** draft, 2026-10-28. Not published. The go-live checklist needs "tax, refund and auto-renewal terms published, with legal review". This draft matches what the code does (ADR 0100), so the review starts from facts. Items marked **Owner decision** are yours to choose; the draft shows the recommended default.

When approved, it becomes a "Paid plans" section in `/terms` (`src/app/(site)/terms/page.tsx`). Billing's consent step already links to the terms and shows the plan's own words before checkout.

---

## Paid plans

**Who you pay.** Dodo Payments is the merchant of record for Farbaek's paid plans. You pay Dodo Payments, which:
- runs the checkout;
- works out and collects sales tax or VAT;
- issues your receipts and invoices;
- keeps your payment method.

Farbaek never sees your card details.

**Price and tax.** Prices on the pricing page are in US dollars, without tax. Applicable tax is added at checkout, based on where you are, and shown before you pay.

**Renewal.** A plan renews every month, on the day you subscribed, and charges your payment method until you cancel. Before checkout you tick a box with the exact price and these renewal terms. Farbaek keeps a record of what you agreed to and when.

**Cancelling.** You can cancel at any time from Billing, in two steps.
- Your plan keeps working until the end of the period you paid for. Then the workspace moves to Free and nothing more is charged.
- Until that date, you can keep the plan instead.
- Your projects and data stay. Anything over Free's limits is kept, but you can't add more until you're under them.

**Changing plans.**
- **Upgrading:** takes effect once the payment goes through. You're charged the difference for the rest of the current period, and Billing shows the amount before you confirm.
- **Downgrading:** takes effect at the end of the current period, with nothing extra charged.

**Failed payments.**
- If a renewal payment fails, paid features keep working while you update your payment method from Billing.
- If it still can't be collected, paid features pause until it is.
- Your data is kept, and exports, billing and safety controls always work.

**Refunds.** **Owner decision.** Recommended default: payments aren't refunded for part of a period once it has started, except where the law requires a refund, or Dodo Payments' buyer protection applies. If something went wrong on Farbaek's side, contact support and we'll put it right.

An alternative: a full refund on request within 7 days of the first payment of a plan, once per workspace.

**AI usage.** Each plan's AI usage is set by the price list when you pay. Unused usage rolls over for one more month and the oldest is spent first. AI usage has no cash value, can't be transferred, and isn't refunded on its own.

**The free trial.** The trial is Farbaek's own. It needs no card and never turns into a paid plan by itself: when it ends, the workspace moves to Free. Choosing a paid plan during the trial ends the trial that day.

**Price changes.** **Owner decision**, with a recommended default: we tell you by email at least 30 days before a new price applies to your plan, and you can cancel before then. Existing subscriptions keep their price until that date.

**Taxes and invoices.** Receipts and invoices come from Dodo Payments, in its portal, which you reach from Billing.

---

## For the reviewer: how each line is enforced

| Term | Where it's enforced |
| --- | --- |
| Merchant of record, tax at checkout | Products are created tax-exclusive (`tax_inclusive: false`) and checkout is hosted by Dodo |
| Consent record | `billing_checkouts.consent_text` and `consent_sha256`, migration v62 |
| Monthly renewal until cancelled | Products charge monthly, with a 20-year term (Dodo's "until cancelled") |
| Cancel to period end, keep | `cancel_at_next_billing_date`, shown with its date in Billing |
| Upgrade now (prorated) or downgrade at period end | `prorated_immediately` with `prevent_change`, or `next_billing_date` with `do_not_bill` |
| Failed payment: access kept, then paused | `past_due` keeps the plan; `on_hold` suspends paid features (`resolveEffectivePlan`) |
| Trial never converts | No provider trial (`trial_period_days: 0`); the trial ends to Free (`expireTrialIfDue`) |
| Emails on changes | `src/server/billing/notices.ts` |

Not yet built:
- **Price-change emails:** prices are only changed by a new catalog version, and existing subscriptions keep their Dodo product.
- **Refund handling in Farbaek:** refunds are made in Dodo's dashboard.
