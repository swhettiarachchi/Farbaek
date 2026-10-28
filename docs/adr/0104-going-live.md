# ADR 0104: Going live with Dodo Payments

- Status: accepted (2026-10-28).
- Builds on ADR 0100 (payments in test mode), ADR 0102 (top-ups) and ADR 0103 (the 57% margin). Spec §23.6: "live: enabled only by an environment flag plus an admin confirmation recorded in audit, and only after the go-live checklist".

## Context

Dodo verified the owner's business on 2026-10-28 ("Live payments are active"). The owner made the open decisions:
- no refunds for part of a period, except where the law requires or Farbaek made a mistake;
- 30 days' notice of price changes;
- the owner approves the drafted paid-plan terms themselves, without a lawyer for now;
- a 57% net margin.

## Decision

**Live needs two things,** and either missing means not connected:
- **The live keys on the server:** `BILLING_MODE=live` and both Dodo keys, set by the owner with `scripts/vps/set-dodo.ps1 -Live`;
- **An owner's confirmation in Office Space → Payments:**
  - with the Terms version they approve, a reason and a fresh authenticator code, checked again in the database (`app_staff_confirm_payments_live`, migration v65);
  - recorded in the staff audit chain;
  - the server reads it with the platform switches, every 15 seconds, and fails closed until it has.

**Confirming ends every test-mode plan and test top-up.** Those workspaces go back to Free, with one audit event each, and test top-up grants expire. A test card never counts as a real payment.

**Once live, checkout is open to every workspace.**
- The allowlist only applies in test mode.
- The test-mode band and notice disappear.
- Office Space creates live products before confirming, so they exist when checkout opens.

**Turning live off** takes the same owner, reason and code. New checkouts stop at once; subscriptions already running continue at Dodo.

**The Terms gain a "Paid plans" section,** version `2026-10-28` (`PAID_TERMS_VERSION`). It covers:
- merchant of record, price, currency and tax;
- renewal and cancelling;
- the refund decision and plan changes;
- failed payments, top-ups and the trial;
- 30 days' notice of price changes.

The consent steps link to it.

## Consequences

- **The checklist:** `docs/billing/go-live.md` is complete except the steps only the owner can take (live keys, live webhook secret, Go live).
- **The owner's steps:** `docs/billing/dodo-live.md`.
- **Legal:** the terms are the owner's own approval, not a lawyer's review. That is recorded in the go-live record and in this ADR.
