# ADR 0102: AI usage top-ups, within a spend cap

- Status: accepted (2026-10-28).
- Builds on ADR 0020 (plan economics: the 40% margin), ADR 0100 (payments) and the go-live checklist's "spend cap built, and top-ups (at the plan's own rate, 12-month expiry) apply only up to it".

## Context

Paid plans run out of AI usage mid-month. People could only wait for the reset or switch plans. `usage_grants` already had a `topup` kind, drawn soonest-expiry-first after plan usage, but nothing could buy one. The checklist needed a spend cap first.

## Decision

**Packs.**
- **Prices:** $10, $25 and $50 (`src/core/billing/topups.ts`), one-time Dodo products created from Office Space (tax-exclusive). Checkout offers the currency picker, as for plans.
- **Usage:** a pack adds usage at the plan's own rate, floor(price ÷ plan price × the plan's monthly AI units). The plan's price already covers its sandbox time and fixed costs, so the rate is conservative and the margin holds.
- **How long:** a top-up lasts 12 months and is drawn after plan usage.
- **On screen:** a pack shows "about N% of a month of {plan} usage", never units.

**Who can buy.**
- Workspaces on a paid subscription that's still running: active, payment due, or cancellation scheduled.
- Owners and admins only.
- In test mode, only the listed workspaces.

**The spend cap.**
- **What it is:** `billing_accounts.topup_cap_cents`, a monthly limit from $0 to $1,000, set by an owner or admin. With no limit, top-ups are off.
- **How it's enforced:** `app_billing_start_topup` locks the account and counts this calendar month's paid top-ups plus checkouts opened in the last 24 hours, so open checkouts can't pass the limit either.
- **No auto top-up:** nothing is ever bought on its own.

**Usage arrives only from the provider.**
- **Marking:** a top-up checkout carries `metadata.farbaek_topup`.
- **Re-reading:** on `payment.succeeded` without a subscription, the processor reads the payment back from Dodo. It must be `succeeded`, be marked as a top-up, and name its checkout session.
- **Granting:** `app_billing_complete_topup` finds the top-up by that session and adds one grant, keyed `topup:{id}`.
- **Once only:** a repeat returns `already`. A second, different payment for the same session is refused, not granted twice.

**Consent.** The words agreed to (amount, currency choice and fee, how long it lasts) are stored with their SHA-256, as for plans.

## Consequences

- **Billing:** a "Top up AI usage" card with the limit and what's been bought this month, the three packs, and a consent step. The wallet card's spend-cap rule describes it.
- **Office Space → Payments:** lists and creates the packs, with a price check.
- **Migration v64** (`20261205090000_topups.sql`) is additive, applied before the code.
- **Not done:**
  - refunds of top-ups, made in Dodo's dashboard and not reflected in the grant;
  - top-ups on Free or the trial.
