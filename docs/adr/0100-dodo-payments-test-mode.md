# ADR 0100: Dodo Payments, connected in test mode

- Status: accepted (2026-10-28).
- Spec §15 (subscription states), §20 (billing tests), §23 (Dodo-ready billing).
- Builds on ADR 0020 (plan economics) and ADR 0065 (the internal trial). It keeps CLAUDE.md's rule that billing stays off until `docs/billing/go-live.md` is complete: live mode is refused in code.

## Context

Billing has been `not_connected` since the start. The plan catalog, the internal 14-day trial, the lifecycle states and the anchored usage grants were built, but nothing could take a payment. The owner created a Dodo Payments business ("Farbaek"). Its verification (KYC) isn't done, so only test mode is available. Dodo's API, webhooks and cancellation semantics were re-read on 2026-10-27 (`docs/research/2026-10-27-dodo-payments.md`).

## Decision

**1. REST over `fetch`, no SDK.**
- **Why:** spec §23.2 suggested the `dodopayments` SDK, but Farbaek uses seven endpoints. The repo pins every dependency and asks before installs, and the dev PC is low on disk.
- **Where:** `src/server/billing/providers/dodo/client.ts` speaks the REST API, parses every response with zod and maps errors to codes. Nothing outside that folder talks to Dodo.
- **Verification:** `webhook.ts` checks Standard Webhooks signatures with `node:crypto`.

**2. Modes.** `BILLING_MODE` is `not_connected` (the default), `test` or `live`.
- `readBillingConfig` connects only for `test` with both `DODO_PAYMENTS_API_KEY` and `DODO_PAYMENTS_WEBHOOK_KEY` set.
- `live` is treated as not connected, and Office Space says why.
- **Who can check out:** in test mode a test card could buy a real workspace a paid plan. So only workspaces listed in `BILLING_TEST_WORKSPACES` can, checked on the server for both checkout and webhook processing.
- **Secrets:** the owner sets all of these with `scripts/vps/set-dodo.ps1`, typed hidden. They're never shown.

**3. Webhooks** at `POST /api/webhooks/dodo`.
- **Verified first:** on the raw body, against `webhook-id.webhook-timestamp.body` with the base64 key from `whsec_…`, accepting any `v1,` entry so a rotated secret works. Timestamps more than 5 minutes off either way are refused, before the body is read.
- **Stored once** in `provider_webhook_events`, unique by `(provider, webhook_id)`: a replay returns 200 and does nothing.
- **Processed** after the response, through Next's `after()`. The hourly job retries failures after 1, 5 and 30 minutes, then 2, 5 and 10 hours, and gives up after 8 attempts. Office Space can replay one.
- **Retention:** processed payloads are deleted after 90 days, since they hold names and email addresses.

**4. State comes from the provider, never the webhook.**
- Processing re-reads the subscription with `GET /subscriptions/{id}`.
- It maps it with `mapSubscription` (`src/core/billing/provider-state.ts`), then applies it with `app_billing_apply_subscription` in one transaction with one audit event.
- An older read never overwrites a newer one (`provider_synced_at`). So duplicates, retries and out-of-order events all settle on the provider's latest state.
- **The mapping:**

  | Dodo state | Farbaek state |
  | --- | --- |
  | active | active, or cancellation_scheduled when `cancel_at_next_billing_date` is set |
  | past_due | past_due (paid access kept) |
  | on_hold | suspended, reason payment |
  | paused | suspended, reason paused |
  | cancelled, period not over | cancellation_scheduled until `next_billing_date` |
  | cancelled after the period, or expired | expired |
  | pending, failed | no change |

**5. Checkout records consent and changes nothing else.**
- `app_billing_start_checkout` stores the exact words agreed to, with their SHA-256, the amount and who agreed.
- The workspace's state changes only when the provider confirms. An abandoned checkout can't strand anyone in `checkout_pending`, so that state stays reserved and the Billing page shows "checkout started" from the record instead.

**6. Prices fail closed.**
- One monthly product per paid plan, created from Office Space through the API and recorded in `billing_products` against the catalog version.
- Products are created with `trial_period_days: 0`, `tax_inclusive: false`, and 20 years of monthly charges (Dodo's documented "renews until cancelled").
- Checkout and plan changes refuse a plan whose stored amount differs from the catalog. Office Space reads each product's price back from Dodo and flags a mismatch.
- The checkout body never carries `subscription_data`, so the trial is never Dodo's. Tests assert both.

**7. Plan changes.**
- **Upgrades:** `prorated_immediately` with `on_payment_failure: prevent_change`, shown first with Dodo's preview amount.
- **Downgrades:** `effective_at: next_billing_date` with `do_not_bill`, shown with the date.
- **Cancellation:** sets `cancel_at_next_billing_date`, shown with the date access ends. "Keep my plan" clears it.

**8. Usage grants follow the subscription.** `subscription_started_at` is the anchor for `currentGrant`, so a paid period resets on the subscription's day of the month. Evaluation limits still use calendar months.

## Consequences

**What people see:**
- A test-mode band on every page, for the allowlisted workspace only.
- A consent step before checkout.
- The effective date before cancelling.
- Dodo's portal for cards and invoices.
- Everyone else's Billing still says payments aren't connected.

**Migration v62** (`20261203090000_payments.sql`):
- service-role functions for webhooks, checkouts and subscriptions;
- two staff actions, `billing.products` (owner) and `billing.replay` (owner, admin), with one chained staff event each.

**Not done yet:**
- live mode, which needs the go-live checklist, including KYC;
- annual prices;
- emails on billing changes;
- refunds and disputes, which are stored and shown in Office Space but don't change state;
- billing tests 7, 8, 15 and 18 against real Dodo test-mode webhooks, which need the owner's keys.
