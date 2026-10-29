# Stage 80: Going live with Dodo Payments

Dodo verified the business on 2026-10-28. This stage builds the safe way to switch live payments on, using the owner's decisions:
- no refunds mid-period;
- 30 days' notice of price changes;
- terms approved by the owner;
- a 57% margin.

- **Decision record:** `docs/adr/0104-going-live.md`.
- **Branch:** `feat/payments-live`.

## 2026-10-28

### Done

- **Migration v65** (`20261206090000_payments_live.sql`):
  - `billing_go_live`;
  - `app_staff_confirm_payments_live` (owner, step-up and a reason; ends test plans and test top-ups);
  - `app_staff_end_payments_live`;
  - `billing.go_live` in `staff_can` and `PERMISSIONS`.
- **The server:**
  - the platform state reads the confirmation, with `paymentsLiveConfirmed()` failing closed;
  - `readBillingConfig` opens live only with keys and confirmation, and then checkout is open to all;
  - `readProviderConfig` lets Office Space create products first;
  - the webhook route and the hourly job read the confirmation fresh.
- **Office Space → Payments:** the "Go live" card (the checklist from the code, the confirm form, "Turn off live payments"), and product creation in either mode.
- **`set-dodo.ps1 -Live`** for the live keys.
- **The Terms:** the "Paid plans" section (version 2026-10-28), linked from both consent steps. The processor entry no longer says "only test payments".
- **Billing:** the test band and notice only in test mode.

### Verified

- **PGlite** (`tests/db/payments-live.test.ts`, 4):
  - browsers refused;
  - owner, step-up and reason required, with nothing recorded when refused;
  - confirming ends the test plan and test top-up, with one staff event and one workspace audit event, and leaves other workspaces untouched;
  - turning off once; confirming again turns it back on.
- **Unit:**
  - live config needs keys and confirmation, then opens to all;
  - the provider config for Office;
  - status wording.
- `pnpm test`: 1,998 passed, 17 skipped. `pnpm typecheck` and `pnpm lint` are clean.
- **Migration v65 applied in production** (2026-10-28), before the code. The SHA-256 (`782c305c…602871`) was checked on the server, and it ran in one transaction. Read back:
  - row security on, and no row yet, so live is off;
  - only the server role can run both functions;
  - `billing.go_live` is owner-only.
  - `/api/health` stayed OK.

### Not verified yet

- **A first real checkout:** the owner's call, since it charges real money.

## 2026-10-29: live

### Done

- **The owner's steps** (`docs/billing/dodo-live.md`):
  - in Dodo's Live Mode, an API key (IP `2.25.88.188/32`; Read on Payments, which top-ups need; Write on Subscriptions, Products, Customers and Checkout Sessions) and the webhook endpoint (every `subscription.*` event, `payment.succeeded` and `payment.failed`);
  - `set-dodo.ps1 -Live`;
  - in Office Space → Payments, **Create live products**, then **Go live** at 08:51 Sri Lanka time.
- **Wording that said payments weren't connected:**
  - the home page FAQ now says nothing is charged unless you choose a paid plan;
  - the pricing FAQ on annual prices no longer promises them;
  - the trial reminder emails point to the plans when live payments are on, and keep the old wording otherwise. The hourly job reads the live switch first.
- **Office Space → Payments:** the connection card says "Live mode." with a verified icon, instead of "Test mode.".

### Verified

- Production on `af35d04` (PRs #97 and #98), `/api/health` ok.
- The webhook endpoint answered 503 before Go live and 401 to an unsigned call after it, so live deliveries are accepted and signatures are checked.
- Office Space showed all four checklist items, then "Live payments since Oct 29, 2026, 8:51 AM".
- `/terms` has the `paid-plans` section.
- Typecheck, lint and the billing, jobs and design tests (284) are clean.
