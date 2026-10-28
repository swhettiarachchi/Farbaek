# Dodo Payments: API, webhooks and cancellation, re-verified

Read on 2026-10-27 from the official documentation at docs.dodopayments.com: the API reference pages, each with its OpenAPI excerpt, plus the Webhooks guide. This is the go-live checklist's "re-verified against the official docs" note. Re-read these pages before going live; the shapes below are what `src/server/billing/providers/dodo/` relies on.

## Environments and auth

- **Test:** `https://test.dodopayments.com`. **Live:** `https://live.dodopayments.com`. Keys are separate per mode.
- **Auth:** `Authorization: Bearer <API key>`.

## Endpoints Farbaek uses

| Use | Request | Fields relied on |
| --- | --- | --- |
| Checkout | `POST /checkouts` | `product_cart [{product_id, quantity}]`, `customer {email, name?}`, `return_url`, `metadata`. Returns `session_id` and `checkout_url` (null only when `payment_method_id` is passed). `subscription_data.trial_period_days` exists and is never sent. |
| Subscription | `GET /subscriptions/{id}` | `subscription_id`, `status`, `product_id`, `created_at`, `next_billing_date`, `cancel_at_next_billing_date`, `customer.customer_id`, `metadata` |
| Cancel or keep | `PATCH /subscriptions/{id}` | `{cancel_at_next_billing_date: true \| false}`; returns the subscription |
| Change plan | `POST /subscriptions/{id}/change-plan` | `product_id`, `quantity`, `proration_billing_mode` (`prorated_immediately`, `full_immediately`, `difference_immediately`, `do_not_bill`, `prorated_immediately_keep_cycle`), `effective_at` (`immediately`, `next_billing_date`), `on_payment_failure` (`prevent_change`, `apply_change`) |
| Preview a change | `POST /subscriptions/{id}/change-plan/preview` | `immediate_charge.summary.total_amount` (smallest unit) and `currency` |
| Portal | `POST /customers/{id}/customer-portal/session?return_url=` | returns `{link}` |
| Products | `POST /products`, `GET /products/{id}` | `name`, `tax_category: saas`, `price` |

**Subscription statuses:** `pending`, `active`, `on_hold`, `paused`, `cancelled`, `failed`, `expired`, `past_due`.

**Product price** (`type: recurring_price`):
- **Amount:** `price` is in the smallest unit (cents) with a `currency`.
- **Billing cycle:** `payment_frequency_count` and `payment_frequency_interval`, which is one of `Day`, `Week`, `Month` or `Year`.
- **Term:** `subscription_period_count` and `subscription_period_interval`. This is the subscription's whole term, not the billing cycle: the docs recommend 20 years for "renews until cancelled" and warn that 1 month makes a monthly plan expire after a month.
- **Also:** `tax_inclusive` and `trial_period_days`.

**A plan change via a payment link** (`collect_via_payment_link`) needs a business capability that's off by default. Farbaek charges the saved card instead, with `prevent_change`, so the new plan applies only once paid.

## Webhooks

- **Standard:** the Standard Webhooks specification. Headers `webhook-id`, `webhook-timestamp` (seconds) and `webhook-signature`.
- **Signing:** HMAC-SHA256 over `"{id}.{timestamp}.{raw body}"`, keyed with the endpoint secret: remove `whsec_`, then base64-decode. The signature header holds space-separated `v1,<base64>` entries.
- **Rotation:** an old secret stays valid for 24 hours, so several signatures can arrive at once.
- **Tolerance:** 5 minutes for the timestamp.
- **Retries:** a 30-second timeout and up to 8 attempts (immediately, then 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 10 h). Events can arrive more than once and out of order.
- **Body:** `{business_id, type, timestamp, data: {payload_type, …}}`.

**Subscription events:**

| Event | When |
| --- | --- |
| `subscription.active` | |
| `subscription.updated` | Any field |
| `subscription.past_due` | Grace period. Carries `past_due_ends_at` |
| `subscription.on_hold` | |
| `subscription.paused` | |
| `subscription.unpaused` | |
| `subscription.renewed` | Carries `payment_id` |
| `subscription.plan_changed` | |
| `subscription.update_payment_method` | |
| `subscription.cancelled` | |
| `subscription.failed` | Mandate creation failed |
| `subscription.expired` | |

**Other events:**
- payment: `succeeded`, `failed`, `processing`, `cancelled`;
- refund: `succeeded`, `failed`;
- dispute: `opened`, `challenged`, `accepted`, `cancelled`, `expired`, `won`, `lost`.

## Cancellation semantics

`cancel_at_next_billing_date: true` keeps the subscription `active` until the next billing date, then it ends. Farbaek shows this as "Cancelled, runs until {date}". A merchant cancellation can end it at once. Farbaek still keeps access to `next_billing_date` when that's in the future, since the period was paid for.

## Adaptive currency (read 2026-10-28)

Source: `docs.dodopayments.com/features/adaptive-currency.md`.
- **How it charges:** the customer pays in their local currency at live exchange rates.
- **The fee:** 4% under $500, 3% from $500 to $1,500, 2% over $1,500.
- **Who pays ("Exclusive", the default):** the fee is added on top for the customer, and the merchant settles the full base price.
- **"Fees Inclusive":** the merchant absorbs it.
- **Per request:** the default can be overridden per payment, plan change or on-demand charge with `adaptive_currency_fees_inclusive`. Farbaek never sends it, so the business default applies.
- **Checkout:** `billing_currency` fixes a currency while adaptive pricing is on; the picker is `feature_flags.allow_currency_selection` (default true).

**Confirmed in test mode:**
- the first test checkout let the owner pick NZD and charged NZ$92.61;
- the webhooks still applied (the subscription's product and dates don't depend on the currency).

## Still to confirm in test mode

Each needs the owner's test keys:
- the subscription carries the checkout's `metadata` (Farbaek's workspace id);
- the test card numbers Dodo lists for success and failure;
- the webhook's exact `webhook-id` format;
- a test renewal, which Dodo can trigger from the dashboard.
