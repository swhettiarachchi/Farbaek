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

- **Live itself:** the owner's three steps in `docs/billing/dodo-live.md`, then a first real checkout, which is the owner's call.
