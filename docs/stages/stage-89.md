# Stage 89: Plans bought in the iPhone app

The owner wants paying on iPhone to be as easy as possible. So Farbaek for iPhone sells plans with Apple's In-App Purchase, one tap with Face ID, in every country. In the US App Store, it also links to paying on the website, with no Apple fee.

- **Decision record:** `docs/adr/0112-app-store-subscriptions.md`.
- **The owner's steps:** `docs/mobile/ios.md`, step 8.
- **Branch:** `feat/iphone-web-upgrade`.
- **Migration:** v71 (`20261212090000_apple_purchases.sql`).

## 2026-10-29

### Done

- **Prices** (`src/core/billing/apple.ts`): Lite $0.99, Maker $1.99, Starter $10.49, Plus $20.99, Pro $53.99. Each keeps at least what the plan keeps on the web after Dodo's worst case, at Apple's 15% (Small Business Program).
- **Apple's signatures** (`src/server/billing/apple/jws.ts`):
  - the chain is pinned to Apple Root CA - G3;
  - each certificate is checked against the next, with Apple's markers and the dates;
  - the ES256 signature is checked, with Node's own crypto.
- **Purchases and notifications** (`src/server/billing/apple/service.ts`):
  - the app reports a purchase whose `appAccountToken` names the workspace, accepted only from its owners and admins;
  - App Store Server Notifications version 2 apply renewals, grace periods, turning renewal off, refunds and expiry through `app_billing_apply_subscription`;
  - each notification is handled once, and a failure asks Apple to send it again.
- **One provider per workspace:**
  - an Apple purchase is refused for a workspace the web bills;
  - the web's checkout, plan changes, cancelling and portal refuse a workspace Apple bills;
  - the Billing page says "Billed through the App Store" and why each plan button isn't there.
- **The app:**
  - a Plans sheet with Apple's prices in the buyer's currency, Subscribe, Restore purchases, Manage subscription, the renewal terms, and Terms of Use and Privacy Policy links;
  - the You tab's plan section;
  - "See plans" when the plan refuses a build;
  - a listener for renewals StoreKit delivers;
  - in the US App Store only, "Or pay on www.farbaek.com".
- **Terms:** a new section, "Plans bought in the iPhone app". The Paid plans section and its version are unchanged.
- **Privacy Policy:** what Apple sends Farbaek.
- **Off until** `APPLE_IAP=on`.

### Verified

- **Unit:**
  - prices against the margin rule, including that 30% would break it (4);
  - signatures: a real chain, a forged record, a foreign root, Apple's root pinned by default (3);
  - purchases and notifications: the plan applied, members and other workspaces refused, never billed twice, replays, retries (6);
  - the phone route (1).
- **PGlite** (`tests/db/apple-purchases.test.ts`, 4):
  - Apple through the same apply function;
  - an unknown provider refused;
  - notifications recorded once;
  - only the server can reach any of it.
- **Existing tests:** billing, phone, design and config tests pass. Typecheck and lint are clean. The iPhone fixtures were regenerated with the new `billing` field.

### Not verified yet

- **The Swift code:** the first macOS run, after 1 November.
- **A real sandbox purchase and a real App Store notification:** these need the owner's Paid Apps Agreement and the five subscriptions in App Store Connect.

### Next

1. Apply v71 in production before the merge.
2. The owner's step 8: agreement, Small Business Program, subscriptions, notification URL.
3. Then `APPLE_IAP=on`.
