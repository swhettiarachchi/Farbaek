# ADR 0154: Plans bought through Google Play in Farbaek for Android

- Status: accepted (2026-11-02). Amends ADR 0150 (nothing sold in the Android app). Builds on ADR 0099 (the Trusted Web Activity) and ADR 0112 (App Store subscriptions).
- Migration v87 (`supabase/migrations/20261228090000_google_play_purchases.sql`).
- Asked for by the owner: the Android app should bill through Google, just as the iPhone app bills through Apple. It was held while the calm Billing page shipped (stage 134, ADR 0150's update), then built into that page the same day, when the owner asked for the recommended way, easy and attractive for people (stage 135).

## Context

Farbaek for Android is www.farbaek.com in a Trusted Web Activity. ADR 0150 made it sell nothing, because Google Play's Payments policy says an app that sells digital services must sell them through Google Play's billing. Google Play production opens around 2026-11-16, and the owner wants people to pay easily on phones.

**How a TWA buys through Google Play.** The website calls the Digital Goods API and the Payment Request API with the method `https://play.google.com/billing`. androidbrowserhelper's billing module (`com.google.androidbrowserhelper:billing`) passes those calls to Google Play Billing.

**What Google's library can and can't do,** read in its `MethodData.java`:
- **It can't attach an account id.** So a purchase can't name its workspace, unlike Apple's `appAccountToken`.
- **It can replace a subscription** when given the current `purchaseToken` and a `replacementMode`. Without them, a different plan becomes a second subscription.

**What Google needs from the server:**
- **Google signs nothing.** The server asks the Google Play Developer API (`purchases.subscriptionsv2`) with a service account.
- **Acknowledge within 3 days.** A purchase not acknowledged in that time is refunded.
- **No free push.** Real-time developer notifications need Cloud Pub/Sub, which may need a paid Google Cloud billing account, and the owner has no budget.

**Feasibility.** Google's supported-locations table lists Sri Lanka for merchant registration. Nothing here costs money to run.

## Decision

**The flow, side by side with the iPhone app:**

| | iPhone (ADR 0112) | Android (this ADR) |
| --- | --- | --- |
| Buy | StoreKit sheet | Google Play sheet, through Payment Request |
| Proof | Apple's signed record | The server asks Google's Play Developer API |
| Tied to a workspace | `appAccountToken` | An intent opened from Billing just before buying |
| Kept current | Apple's notifications | An hourly check and the refund list, plus a refresh when the app opens |
| Restore | Restore purchases | The app re-sends its Play purchases when it opens |
| Turned on by | `APPLE_IAP=on` | `GOOGLE_PLAY_BILLING=on`, with `GOOGLE_PLAY_SERVICE_ACCOUNT` |

**What's sold** (`src/core/billing/google-play.ts`):
- Lite, Maker, Starter, Plus and Pro, monthly.
- Each is a Play subscription (`farbaek_<plan>_monthly`) with one base plan, `monthly`, and no offers, so the first offer the library picks is always the base plan.
- The US prices are the App Store's: $0.99, $1.99, $10.49, $20.99 and $53.99.
- Google keeps 15% of subscriptions. A test holds each net at or above the web net, and shows that 30% would break it.
- Play converts other countries' prices; where prices include VAT the net is lower, so the owner checks them when creating the products.
- Top-ups and yearly plans stay unsold in the app, as on iPhone.

**Where it shows.** Only when all three hold:
- the page is in the Android app;
- `getDigitalGoodsService` answers with prices;
- the server is ready (`googlePlayReady()`).

Then:
- **Billing:** one plan picker (`src/components/billing/play-plans.tsx`) takes the place of ADR 0150's list. The person picks a plan, and the tray under the list shows its price, what Google Play charges, Google Play's terms and one button, "Subscribe to {plan}". A workspace Google Play bills switches here ("Switch to {plan}").
- **Prices are in US dollars first** (the owner's choice): Google Play's US prices. Google Play charges each person in their own currency, so when that's another currency a switch shows Google Play's own price for them, and the tray always says what Google Play charges. The choice is kept on the phone (`farbaek-price-currency`).
- **When Google Play can't sell to this workspace or phone,** the list stays, with a notice that says why: a plan billed through the App Store or the website, or a copy of the app that can't reach Google Play's billing (update it in the Play Store).
- **The pricing page,** the same for everyone, asks Google Play itself: the cards show its prices, and one notice leads to Billing.
- **Anywhere else, or when not ready:** the app stays as ADR 0150 has it. Nothing in the app names another way to pay.

**Buying** (`src/components/billing/play-plans.tsx` and `play-billing.tsx`):
1. The page shows Google Play's terms: the price, monthly renewal, and cancelling in Google Play.
2. A server action opens an intent: org, user, product, owner or admin only, at most 20 an hour.
3. Payment Request opens Google Play. For a plan change it passes the current `purchaseToken` with `replacementMode: "withTimeProration"`.
4. The sheet is closed as soon as the token arrives.
5. A server action claims the token. Until it succeeds, the token is kept in `localStorage` and tried again when the app opens, together with the person's current Play purchases.

**The server** (`src/server/billing/google/`):
- **Access:** an RS256 assertion signed with `node:crypto` from the service account, swapped at Google's own token endpoint only, and cached 50 minutes. Errors carry status codes, never Google's body.
- **Binding** (`app_google_bind_purchase`, checked again in SQL). A token binds only:
  - **as a first purchase:** it matches an unused intent for that workspace and product, made at most 30 minutes before the purchase started;
  - **as a successor:** its `linkedPurchaseToken` or `outOfAppPurchaseContext.expiredPurchaseToken` is the workspace's own token.

  It's refused when another workspace holds it, when the workspace is billed by Dodo or Apple, and when it isn't a successor while a Google plan is live. A bound token never moves.
- **Order:** bind, apply (`app_billing_apply_subscription`, provider `google`), then acknowledge.
  - A refused purchase is never acknowledged, so Google refunds it, and the message says so.
  - A pending payment changes nothing until it's paid.
- **States:**

  | Google state | Workspace state |
  | --- | --- |
  | ACTIVE | active, or cancellation scheduled when renewal is off |
  | CANCELED | cancellation scheduled until it expires |
  | IN_GRACE_PERIOD | past due |
  | ON_HOLD | suspended for payment |
  | PAUSED | suspended, paused |
  | EXPIRED | expired, except a token a plan change replaced, which is marked superseded and never applied as expired |

- **The subscription id:** tokens contain dots, which `provider_subscription_id` refuses. So the workspace's row holds `gp_` plus the token's SHA-256, and `google_play_purchases` keeps the token itself, readable only by the server key.

**Kept current without Pub/Sub** (the hourly job `google_play`):
- **Due checks:**
  - every run while unacknowledged;
  - just after expiry, and at least daily;
  - every 6 hours in grace or on hold;
  - 15 minutes while pending.
- **Refunds:** the job pulls `voidedpurchases` (type 1, subscriptions) since its last run, at most 30 days back, and re-checks each token it finds.
- **From the app:** opening it refreshes the person's purchases, at most once every 5 minutes.
- **Later:** a webhook for real-time notifications can be added, because the handler takes a token.

**One provider per workspace:**
- The web's checkout, plan change, cancel and portal refuse a Google-billed workspace (`MANAGED_BY_GOOGLE`).
- Guards now refuse every provider but Dodo, so Apple's claim and notifications refuse Google-billed workspaces too.
- Billing shows "Billed through Google Play" with "Manage in Google Play" (Google's own subscriptions page), and the receipts line names the right provider for each of the three.
- The iPhone app is told "web" for a Google-billed workspace until a later build knows "google", because build 22 offers App Store purchases for anything but "web".

**Headers.** `Permissions-Policy` stays `payment=()` everywhere, except Farbaek's own host (from `NEXT_PUBLIC_SITE_URL`), which gets `payment=(self)`. People's published sites, previews and Office Space never get it.

**The Android app (1.1.0, versionCode 3):**
- `com.google.androidbrowserhelper:billing:1.2.0`;
- `com.farbaek.app.DelegationService`, which registers `DigitalGoodsRequestHandler`;
- the manifest's `PaymentActivity` and `PaymentService`, as androidbrowserhelper's twa-play-billing demo declares them.

**Legal:**
- The Terms gain "Plans bought in the Android app": Google bills, the price can differ, cancel in Google Play, deleting the account doesn't cancel it, Google's refund policy, and unconfirmed purchases are refunded.
- The Privacy Policy says what Google sends.

## Consequences

- One tap to pay in the Android app, in every country Google Play sells in, with the same plans and checks as the iPhone.
- **The owner's steps before selling** (`docs/mobile/android.md`, "Selling plans in the app"):
  - a payments profile;
  - a Google Cloud service account with Play access;
  - `scripts/vps/set-google-play.ps1`;
  - the five subscriptions;
  - license testers;
  - the 1.1.0 upload;
  - Data safety and Financial features;
  - `-TurnOn`.
- **A gap without Pub/Sub:** a cancel or refund shows within an hour (or when the app opens), not instantly. A license tester's 5-minute renewals run ahead of the hourly check.
- Not testable on the emulator: Google Play billing works only in an app installed from Google Play. The end-to-end test uses a license tester on the closed test.
