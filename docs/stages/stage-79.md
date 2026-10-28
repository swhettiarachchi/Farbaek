# Stage 79: AI usage top-ups, within a spend cap

The last billing item on the go-live checklist: buying more AI usage, at the plan's own rate, never past a monthly limit.

- **Decision record:** `docs/adr/0102-topups-and-spend-cap.md`.
- **Branch:** `feat/topups`.

## 2026-10-28

### Done

- **`src/core/billing/topups.ts`:** the packs ($10, $25, $50), units at the plan's rate, the share for display, 12 months, the consent words, and the plan states that can buy.
- **Migration v64** (`20261205090000_topups.sql`):
  - the monthly limit on `billing_accounts`;
  - `billing_topup_products` and `billing_topups`;
  - set the limit (owner or admin);
  - start a top-up within the limit, counting checkouts open in the last day;
  - complete it by its checkout session, once, with a 12-month grant;
  - the staff product record. One audit event each.
- **The Dodo client:** one-time products, `getPayment`, and top-up checkouts marked in metadata.
- **Webhooks:** `payment.succeeded` for a top-up is read back from Dodo and applied by its session; other one-time payments are ignored, as before.
- **Billing:**
  - the "Top up AI usage" card: the limit form, bought this month, three packs with their share and the reason when one can't be bought;
  - the consent step;
  - the waiting notice after checkout;
  - the wallet card's spend-cap rule.
- **Office Space → Payments:** top-up packs in the products table with a live price check; "Create test products" makes them.

### Verified

- **PGlite** (`tests/db/topups.test.ts`, 5):
  - browsers refused;
  - the limit: owner or admin, range, no plan, no limit;
  - counting paid and open purchases, an old open one no longer counted;
  - completion by session: once only, a second payment refused, the 12-month grant;
  - the staff record, once.
- **Unit:**
  - `src/core/billing/topups.test.ts` (4): the plan's rate, never more than the plan's own budget would give, consent words;
  - `src/server/billing/topups.test.ts`: checkout body and recorded units, gates before the provider, limit refusals, limit parsing, one-time product body, `getPayment`, and the webhook path (succeeded applied by session, not yet succeeded retried, non-top-ups ignored, no session refused).
- `pnpm test`: 1,993 passed, 17 skipped. `pnpm typecheck` and `pnpm lint` are clean.
- **Migration v64 applied in production** (2026-10-28), before the code. The SHA-256 (`f6a077c5…364d7f`) was checked on the server, and it ran in one transaction. Read back: the limit column; row security on both tables; only the server role can run the four functions. `/api/health` stayed OK.

### Not verified yet

- **A real top-up in test mode:** after the merge, Office Space creates the packs, then the owner sets a limit and buys a $10 pack with Dodo's test card.
