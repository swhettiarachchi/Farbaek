# Stage 135: Plans bought through Google Play in Farbaek for Android

- **Branch:** `feat/google-play-billing-v2`, from main after stage 134 (PR #173).
- **Migration:** v87 (`supabase/migrations/20261228090000_google_play_purchases.sql`).
- **ADR:** 0154. It amends ADR 0150.

## 2026-11-02

### Asked

The owner first asked for the Android app to bill through Google, just as the iPhone app bills through Apple. The server side and a first version of the page were built that day (below, kept from the held branch `feat/google-play-billing`), then held while the owner chose the calm Billing page (stage 134). Later the same day they asked for what Claude recommended, done in an easy, attractive and professional way for people. The recommendation was selling in the app through the store, the only way Google Play allows in every country. So this stage builds Google Play's billing into the calm page. While it was being built, they asked for prices always in USD, with a way to switch to the person's own currency.

Google Play production opens around 2026-11-16, after the closed test's 14 days.

### Checked before building

- **Google's library** (android-browser-helper's `playbilling`, published as `com.google.androidbrowserhelper:billing` 1.2.0 on 2026-07-30):
  - the Payment Request data takes `sku`, plus `purchaseToken` and `replacementMode` for a plan change;
  - it can't carry an account id, or choose an offer;
  - it depends on androidbrowserhelper 2.2.2, and Gradle picks our 2.7.4.
- **Google's API:** `purchases.subscriptionsv2`, acknowledge within 3 days, and `voidedpurchases` for refunds.
- **Real-time notifications** need Pub/Sub, which may need a paid Google Cloud billing account. So Farbaek checks on a schedule instead.
- **Sri Lanka** supports Google Play merchant registration.
- **An independent design review** found:
  - a plan change without the current token starts a second subscription;
  - a replaced token's EXPIRED would remove the plan;
  - refusals must not be acknowledged, so Google refunds them;
  - `Permissions-Policy: payment=()` blocks the purchase sheet.

  All four are handled.

### Done

- **The database (v87):**
  - provider `google`;
  - `google_play_intents`, `google_play_purchases` (the token kept for the server only) and `google_play_sync`;
  - `app_google_open_intent`, `app_google_bind_purchase` (intent or successor only, never moves, refuses Dodo- and Apple-billed workspaces), `app_google_mark_checked`, `app_google_mark_acknowledged` and `app_google_set_voided_since`, all for the server key only.
- **`src/core/billing/google-play.ts`:** the five products and their US prices, the 15% rule, the state mapping, the predecessor token and the next-check times.
- **`src/server/billing/google/`:**
  - the service account's RS256 assertion and token cache (`node:crypto` only);
  - the API client;
  - claim (bind, apply, then acknowledge; a refusal never acknowledges);
  - the hourly sync (due checks and refunds);
  - the wiring (`GOOGLE_PLAY_BILLING`, `GOOGLE_PLAY_SERVICE_ACCOUNT`).
- **Providers:**
  - the web's checkout, change, cancel and portal refuse a Google-billed workspace (`MANAGED_BY_GOOGLE`);
  - guards refuse every provider but Dodo, which fixes Apple's claim and notifications, which only refused Dodo;
  - the iPhone app is told "web" for Google-billed workspaces until a build knows "google".
- **The hourly jobs:** `google_play`.
- **Billing inside the app, one plan picker** (`src/components/billing/play-plans.tsx`), in place of stage 134's list once Google Play sells plans:
  - a raised panel with "Choose a plan", "Monthly plans, billed through Google Play" and a Google Play chip;
  - **prices in US dollars by default,** Google Play's US prices ($0.99 to $53.99). When Google Play charges the person in another currency, a pill switch, "Show prices in USD | LKR", shows Google Play's own price for them instead. The choice is kept on the phone and shared with the pricing page;
  - Lite, Maker, Starter, Plus and Pro as a radio list, each with its price, sessions, sandbox hours and seats, and "Current", "Trial" or "Recommended";
  - Pro starts picked, as the pricing page recommends; the current paid plan can't be picked;
  - the tray under the list shows the pick and its price, then what Google Play actually charges when that's another currency ("Google Play charges LKR 3,200 a month, in your own currency"; with the local price shown, "The US price is $10.49 a month"), Google Play's terms (charged to the Google account, monthly until cancelled, cancel in Google Play a day before it renews), one "Subscribe to {plan}" button, and the Terms and Privacy links;
  - a workspace Google Play bills sees "Switch your plan", "Switch to {plan}" and how Google counts the time left; a plan set to end asks to restore it in Google Play first, with "Manage in Google Play";
  - someone who can't manage billing sees "Owners and admins choose plans";
  - while Google Play's prices load, the panel's own shape pulses (still under reduced motion);
  - "Studio and larger plans aren't sold in the Android app".
- **When Google Play can't sell here,** stage 134's list stays, and its notice says why:
  - the server isn't selling through Google Play: "Plans aren't sold in the Android app", as before;
  - the plan is billed through the App Store: change or cancel it on the iPhone;
  - the plan is billed on the web: "Your plan isn't billed through Google Play", with no link;
  - this copy of the app can't reach Google Play's billing: "Update the app in the Play Store, then open Billing again".
- **The rest of the website in the app:**
  - the claim is kept on the phone and retried until it lands, and the app re-sends its Google Play purchases when it opens;
  - the pricing page shows Google Play's prices on the cards (US dollars unless switched) and one notice, "Plans are billed through Google Play", with the same switch and "Choose in Billing";
  - the website's billing note above the plans (yearly Lite and Maker, cancel in Billing) is left out in the app, where it isn't true;
  - "Billed through Google Play" with "Manage in Google Play" under the current plan;
  - the receipts line names Dodo, Apple or Google Play.
- **On the web,** prices stay in US dollars as before; Dodo's checkout already lets people pay in their own currency. A Google-billed workspace's plan buttons say "Change it in Farbaek for Android", "Cancel in Google Play to move to Free", or "Cancel in Google Play first" for a plan Google Play doesn't sell.
- **Headers:** `payment=(self)` on Farbaek's own host only. Published sites, previews and Office Space keep `payment=()`.
- **The Android app 1.1.0 (versionCode 3):**
  - the billing library;
  - `com.farbaek.app.DelegationService`, which registers `DigitalGoodsRequestHandler`;
  - `PaymentActivity` and `PaymentService`.
- **Legal:**
  - Terms "Plans bought in the Android app";
  - a Privacy bullet;
  - the delete-account words name all three places to cancel.
- **The owner's script:** `scripts/vps/set-google-play.ps1`. It tests the key from the server (Google's token, then Google Play's access) and saves it only if both work. `-TurnOn` and `-Off` switch selling.
- **Docs:**
  - ADR 0154, and ADR 0150's status;
  - `docs/mobile/android.md` section 4, the owner's steps;
  - `docs/mobile/play-listing.md`;
  - the threat model.

### Verified

- **From the held branch** (unchanged here): the server and database tests cover prices, states and check times; the key file, the assertion's signature and the token cache; claim order, refusals without acknowledging, a successor, a superseded token, pending, the 5-minute refresh, and the hourly sync with refunds; binding rules and grants in PGlite. The setup script passes PowerShell's parser and refuses a throwaway key with Google's `invalid_grant`. The payment permission was checked per host on a demo build (`payment=(self)` on the app's own host only; Next.js matches a host rule on the name without the port).
- **The picker, in a demo build at 375px** (headless Chrome, `?client=android-app`, a stand-in Digital Goods service charging in LKR):
  - five plans as radios, prices in USD first ($10.49 for Starter), the switch's two buttons 44px tall, rows 98px (Pro with its badge 118px), no control under 44px;
  - Pro starts picked on a trial; tapping Starter moves the pick, and the tray shows "$10.49 a month", "Google Play charges LKR 3,200 a month, in your own currency" and "Subscribe to Starter" (48px);
  - switching to LKR changes every row and the tray ("The US price is $10.49 a month"), is stored as `farbaek-price-currency`, and the pricing page in the same tab opens in LKR and switches back;
  - a Google Play charging in USD shows no switch and one price;
  - "Subscribe" calls the intent action, which the demo (no database) refuses with "Plans can't be bought in the Android app yet", so nothing opens;
  - without Google Play's billing, the list shows "Plans are sold through Google Play … Update the app in the Play Store";
  - as a member who can't manage billing (the demo's real role): the plans with prices and "Owners and admins choose plans", no buy button;
  - the pricing page in the app: Google Play's prices on the cards, the notice with the switch and "Choose in Billing", and no web billing note; on the web: the note, USD prices ($9.99 for Starter) and no notice;
  - Billing on the web: the 10 plan cards and "Prices in USD." as before;
  - no console errors and no sideways scroll anywhere.

  For the owner's view, the demo's `canManage` was set to true and a throwaway key was added to a launch entry. Both were undone, and the launch file was restored from git.
- **Migration v87 applied in production** (2026-11-02), before the merge: the committed file's SHA-256 (`3545298d…ca64262`) was checked on the server, and it ran in one transaction. Read back: the provider check allows dodo, apple and google; the three tables and five `app_google_*` functions exist; row security is on; anon and authenticated can neither run the functions nor read the tables; the server role can run them. Both existing billing accounts are unchanged.
- **`pnpm check`:** typecheck, ESLint on the whole repo, and the full suite: 358 test files and 2,535 tests passed (17 skipped).

### Next

- **The store accounts, checked 2026-11-02:**
  - **Apple:** the Paid Apps Agreement, the bank account and the tax forms are active; the five subscriptions wait as "Prepare for Submission" (the first group goes in with a new app version). The Small Business Program still offers its enrol form, so the 15% rate the prices assume needs the owner to enrol.
  - **Google Play:** Subscriptions says "You need to set up a Google Payments merchant account". No product can be made until the owner sets one up (legal name, address, bank and tax).
- **The owner's steps** in `docs/mobile/android.md` section 4: payments profile, service account, script, subscriptions, license testers, the 1.1.0 upload, declarations, `-TurnOn`.
- **The end-to-end test** with a license tester on the closed test.
- **An iPhone build** that knows `managedBy: "google"`.
