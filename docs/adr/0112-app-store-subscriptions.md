# ADR 0112: Plans bought through the App Store in Farbaek for iPhone

- Status: accepted (2026-10-29).
- Builds on ADR 0100 (Dodo payments), ADR 0103 (the 57% margin), ADR 0105 (Lite and Maker) and ADR 0110 (Farbaek for iPhone).
- Migration v71 (`supabase/migrations/20261212090000_apple_purchases.sql`).

## Context

The owner wants paying to be as easy as possible on iPhone: "users need easy pay because users like smooth and easy pay". ADR 0110 shipped the app as a free companion with no purchases, which Apple's guideline 3.1.3(f) allows only while the app neither sells anything nor points people elsewhere to buy. Apple's rules on buying outside the app:
- **United States App Store:** allowed since May 2025, with no Apple fee (guideline 3.1.1(a)).
- **Other countries:** not allowed.

In-App Purchase is one tap with Face ID, and it works in every country.

## Decision

**In-App Purchase as the way to pay on iPhone**, with the web as a second way in the US.
- **Plans sold:** Lite, Maker, Starter, Plus and Pro, monthly, in one subscription group ("Farbaek plans"), so a change is an upgrade or downgrade, never a second subscription. Larger plans are sold on the web.
- **Prices** (`src/core/billing/apple.ts`):
  - Apple keeps 15% with the Small Business Program, and no fixed fee.
  - Each US price keeps at least what the same plan keeps on the web at Dodo's worst case (9% + 40¢). So the plan's AI usage, worked out from the web price, keeps its 57% margin.
  - Lite $0.99 and Maker $1.99 match the web. Starter is $10.49, Plus $20.99 and Pro $53.99, at most 8% above the web.
  - The test fails if a price breaks the rule, and it shows that 30% (no Small Business Program) would break it. So enrolling is a go-live step.
- **US App Store:** the Plans sheet also offers "Or pay on www.farbaek.com", and a refused build offers the plans. Elsewhere the app shows no way to buy outside the App Store.

**Trust comes from Apple's signatures** (`src/server/billing/apple/jws.ts`). Every transaction, renewal record and server notification is a JWS. The server accepts one only when:
- its certificate chain ends at Apple Root CA - G3, pinned by SHA-256 (`63:34:3A:BF…3E:91:79`, read from apple.com on 2026-10-29);
- each certificate in it was issued and signed by the next;
- Apple's WWDR and App Store markers are present;
- the certificates were valid when the record was signed;
- the ES256 signature checks out.

It uses only `node:crypto`. That signature replaces Dodo's re-fetch from the provider: a record can't be forged without Apple's key. Tests use a stand-in chain made by `scripts/apple-jws-fixtures.mjs`, whose keys are deleted; only public certificates and signed records are committed.

**Linking a purchase to a workspace:**
- The app buys with `appAccountToken` set to the workspace's id, so Apple's signed transaction names the workspace.
- The server accepts it only from an owner or admin of that workspace (`POST /api/v1/app/apple/transactions`).
- After that, the subscription's original transaction id belongs to the workspace and can't move to another.

**Keeping it current** (`POST /api/webhooks/apple`, App Store Server Notifications version 2):
- Renewals, failed payments (grace period, then suspended), turning renewal off, refunds, revocations and expiry each become the workspace's state through `app_billing_apply_subscription`, the same function Dodo's webhooks use. Entitlements, usage and limits work unchanged.
- An older record never overwrites a newer one.
- Each notification is recorded once in `apple_notifications`. A failure answers 500, so Apple sends it again.
- The app also reports renewals StoreKit delivers while it runs, and has **Restore purchases**.

**One provider per workspace:**
- An Apple purchase for a workspace the web bills is refused.
- The web's checkout, plan changes, cancelling and portal refuse a workspace Apple bills, and say it's changed on the iPhone.
- The Billing page shows "Billed through the App Store" in place of Dodo's controls.

**Off until the owner turns it on:** `APPLE_IAP=on`. Until then the app doesn't offer purchases, and both endpoints refuse with 503. Sandbox purchases (TestFlight and App Review) are accepted and recorded in `test` mode.

**Terms and privacy:**
- The Terms gain "Plans bought in the iPhone app": Apple bills and decides refunds, the App Store price can differ, and the plan is cancelled in Settings. The Paid plans section and its agreed version are unchanged.
- The Privacy Policy says what Apple sends Farbaek.

## Consequences

- One tap to pay on iPhone in every country, and payments on the web keep working.
- **The owner's steps before selling** (`docs/mobile/ios.md`):
  - the Paid Apps Agreement, with bank and tax forms;
  - the Small Business Program;
  - the five subscriptions in App Store Connect;
  - the Server Notifications URL;
  - setting `APPLE_IAP=on`.
- **TestFlight testers can get plans without paying:** sandbox purchases are free and are accepted for App Review. Keep TestFlight to trusted people.
- **Not verified yet:**
  - the Swift code (the first macOS run, after 1 November);
  - a real sandbox purchase;
  - a real notification from Apple.

  The signature check, the state rules and the endpoints are tested with signed stand-in records.
- **Not built:** Office Space's revenue page doesn't count App Store income yet (Apple pays out monthly, with its own reports).
