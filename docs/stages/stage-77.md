# Stage 77: Dodo Payments, connected in test mode

The owner asked to connect Dodo Payments. Their Dodo business is set up but not yet verified (KYC), so this stage builds the whole payment path and connects it in **test mode only**. Live payments are refused in code until `docs/billing/go-live.md` is complete.

- **Decision record:** `docs/adr/0100-dodo-payments-test-mode.md`.
- **API notes:** `docs/research/2026-10-27-dodo-payments.md`.
- **Branch:** `feat/dodo-payments`, on top of `feat/android-twa`.

## 2026-10-28

### Done

**Provider boundary** (spec §23).
- **Types:** `src/core/billing/provider.ts`.
- **The mapping:** `provider-state.ts`. Active, cancelling, past due, on hold, paused, cancelled, expired, pending and failed map to Farbaek's states, alongside the plan-change direction and the consent words.
- **The client:** `src/server/billing/providers/dodo/client.ts` speaks Dodo's REST API, with no SDK and no new dependency. That covers checkout, portal, cancel or keep, plan-change preview and change, subscription read, and product create and read. Responses are zod-parsed, errors become codes, and odd ids are refused before any call.

**Webhooks** at `POST /api/webhooks/dodo`.
- **Verification:** Standard Webhooks on the raw body, 5 minutes either way, a 1 MB cap, and 503 while not connected.
- **Storage:** stored once by id.
- **Processing:** after the response, then retried hourly with backoff, giving up after 8 attempts. State is always read back from Dodo, never taken from the payload.

**Migration v62** (`20261203090000_payments.sql`).
- **`billing_accounts` gains** the provider ids, the subscription's start, the cancel flag and the last read.
- **New tables:** `billing_products`, `billing_checkouts` (consent words and their SHA-256) and `provider_webhook_events`.
- **Functions:** record, claim and finish a webhook; start a checkout (owner or admin, one live subscription); apply a subscription (newest read wins, one audit event).
- **Staff:** `billing.products` (owner) and `billing.replay` (owner, admin).

**Billing page.**
- **Who sees it:** for workspaces in `BILLING_TEST_WORKSPACES`, a "Payments test mode" band shows on every page.
- **Choosing a plan:** plan cards offer Choose, Upgrade or Switch. Choosing opens a consent step: the price, tax at checkout, "billing starts today, and your remaining trial days end now" on a trial, and a required box with the exact words. Then Dodo's hosted checkout opens.
- **Coming back:** the page waits for the webhook and refreshes itself.
- **With a subscription:**
  - its state in words with an icon;
  - Dodo's portal for cards and invoices;
  - Cancel, which shows the date the plan ends, and Keep;
  - upgrades shown with Dodo's prorated amount, and downgrades with the date they take effect.
- **Everyone else** sees "Payments aren't connected" as before.

**Emails:** owners and admins are told when the plan changes state (active, payment due, paused, cancelling with its end date, ended, kept), from either the webhook or a person's own action. Renewals send nothing (`src/server/billing/notices.ts`).

**Usage grants:** paid periods follow the subscription's start day (`workspaceGrant`). The go-live checklist's anchor item is now connected.

**Office Space → Payments:**
- the connection, by name only, and the webhook URL;
- the events to subscribe;
- products per plan, with a live price check against the catalog, and "Create test products" (owner);
- the latest 50 webhook events, with Replay for failed ones (owner, admin).

**Owner's script:** `scripts/vps/set-dodo.ps1`.
- It asks for the workspace id, plus the test API key and webhook secret, both hidden and checked silently.
- It saves them, restarts the app, and confirms that the endpoint then refuses unsigned deliveries (401).
- `-Off` switches payments off.
- The steps are in `docs/billing/dodo-test-mode.md`.

**Security:**
- SE-035, "A forged or replayed payment webhook";
- a Payments section in the threat model;
- go-live checklist items ticked only where true, with dates.

### Verified

- **Unit tests,** all on mocks with signed fixtures:
  - `src/core/billing/provider-state.test.ts` (10);
  - `src/server/billing/billing.test.ts` (23, with the notices): signatures (valid, tampered, wrong secret, stale and future timestamps, several `v1` entries, with and without `whsec_`); the route (503, 401, 413, a replay is a no-op, state from the provider); the client's request bodies (no trial, no `subscription_data`, tax-exclusive monthly products); the use cases (role, allowlist, consent, price mismatch, a second subscription, cancel and keep, preview, upgrade and downgrade bodies, the portal);
  - config and status (live refused, names only).
- **Migration v62 in PGlite** (`tests/db/payments.test.ts`, 10):
  - browsers can't reach the functions or the tables;
  - a duplicate webhook returns null;
  - claim, retry and give-up after 8;
  - checkout is for owners and admins, records the consent hash and changes no plan;
  - applying a read is once only, and an older read is skipped;
  - one audit event per change;
  - an ended other subscription is ignored;
  - staff products and replay record one chained event each, and the wrong role is refused.
- **The rest of the suite:**
  - `office-permissions` and `browser-grants` pass unchanged;
  - `pnpm security:eval`: 35 scenarios, 35 passed;
  - `pnpm typecheck` and `pnpm lint` are clean;
  - `pnpm test`: 1,963 passed, 17 skipped.
- **A demo build:**
  - the consent, upgrade, downgrade (with an error), cancel and four subscription states were rendered from a temporary preview page, then removed, at 375 px;
  - no sideways scroll;
  - `/app/billing` itself in the demo (not connected, ignoring `?choose=`) with no console errors;
  - `qa:responsive` on `/app/billing`: 11 views, 0 findings. `qa:a11y`: 0 findings at 1280 and 375.
  - The band's link was widened to 44 px after the audit found it 38 px wide.
- **Migration v62 applied in production** (2026-10-28), before the code, since the new code reads its columns. The file's SHA-256 (`9b1fbfa7…a9204c`) was checked on the server, and it ran in one transaction. Read back:
  - the three tables have row security, and browsers can't read them;
  - the seven new columns are on `billing_accounts`;
  - only the server role can run the seven functions;
  - `staff_can` gives `billing.products` to owners only and `billing.replay` to admins too.
  - `/api/health` and `/api/ready` stayed OK.

### Not verified yet

- **A real test-mode checkout, webhook and renewal.** They need the owner's Dodo test keys (`docs/billing/dodo-test-mode.md`); then billing tests 7, 8, 15 and 18 run for real. Also still to confirm: that the subscription carries the checkout's metadata, and Dodo's test cards.
- **Office Space → Payments in a browser.** It needs a staff session. Its data and actions are covered by the tests above.
- **Not built:** live mode (KYC and the rest of the go-live checklist), annual prices, and state changes from refunds and disputes. Those are stored and listed, not acted on.

### Next (the owner)

1. Finish Dodo's verification (KYC) when ready. Live waits for it.
2. Follow `docs/billing/dodo-test-mode.md`: a test API key, the webhook endpoint, then `scripts/vps/set-dodo.ps1`.
3. In Office Space → Payments, create the test products, then buy a plan with a test card.
