# ADR 0186: Buying in the apps, open by itself

- **Status:** accepted
- **Date:** 2026-11-11
- **Stage:** 175
- **Amends:** ADR 0112 (App Store subscriptions), ADR 0154 (Google Play billing) and ADR 0175 (test purchases). Builds on ADR 0177 (signed-in web pages from the iPhone app).

## Context

The owner: in-app payments still aren't available. Let people upgrade inside the app in as few steps as possible. If that can't be done, send them to the website's checkout. Choose what's best.

Both apps already had in-app purchase built:
- **iPhone:** StoreKit 2, one tap and Face ID (ADR 0112).
- **Android:** Google Play's billing, through the website inside the app (ADR 0154).

Both were held back by a server switch the owner had to turn on (`APPLE_IAP`, `GOOGLE_PLAY_BILLING`), and by store steps:
- **App Store:** the five subscriptions had never been sent to Apple. Apple takes a first subscription only with a new app version.
- **Google Play:** the service account's key wasn't saved on the server yet. Google wasn't letting the new account read purchases on 2026-11-03.

The other way, a link to the website's checkout:
- **App Store:** allowed only in the United States storefront (guideline 3.1.1(a), since May 2025).
- **Google Play:** allowed only for US users, through a separate program with its own fee. Elsewhere it breaks the Payments policy (ADR 0150).

So in most countries, the only allowed way to sell a plan in the apps is the store's own purchase. It's also the shortest: one tap and a confirmation, with no sign-in and no card to type.

## Decision

**Sell plans with each store's own purchase, in every country.** In the United States App Store, the iPhone app also links to the website's checkout, as Apple allows there.

**The switches are on by default.** Apple's agreement and the five plans are in place, and so are Google's payments profile and the five subscriptions. `APPLE_IAP=off` or `GOOGLE_PLAY_BILLING=off` still turns selling off. Nobody meets a screen that can't sell:
- **iPhone:** the server offers plans only to app builds from 1.1.0 (40), the build Apple reviews them with. It reads the build from the User-Agent iOS gives the app ("Farbaek/40 CFNetwork/… Darwin/…"). 1.0.0 (22) went to Apple without the plans, so it never shows them, even once they're approved. If a build can't be read, only a workspace that may test-buy sees the plans.
- **Android:** selling opens only once the service account's key is saved (`set-google-play.ps1`), because without it purchases can't be checked.

**The reviewers' account can test-buy.** A store's test purchase is free, so it only counts for workspaces named in `BILLING_TEST_WORKSPACES` (ADR 0175), and now also for a workspace whose only member is hello@farbaek.com, the account App Review signs in with. Its password is in the store review notes, so the account alone proves nothing. Anyone holding it who brings their own account into a workspace adds a second member, and the workspace stops counting. Without this, a reviewer who buys a plan would see Farbaek refuse it, and reject the app.

**The switches stop new purchases only.** With either switch off, purchases people already made keep syncing: Apple's notifications are still received, and the hourly Google Play check still runs whenever the key is saved.

**New builds state their own build.** Builds after 40 send `X-Farbaek-App` ("1.1.0+41"), and the server prefers it to the User-Agent. An iPhone request whose build can't be read is logged (`phone.build_unknown`), so a User-Agent that stopped matching shows up instead of quietly hiding the plans.

**On the iPhone in the US, the website link opens checkout signed in.**
- The app asks `POST /api/v1/app/billing-link` and opens the answer in Safari.
- The answer is a one-time sign-in link (ADR 0177) to Billing, on the phone's current workspace. It opens at the chosen plan's checkout. If the workspace already pays on the web or through Google Play, it opens Billing itself, which says how that plan changes.
- `/auth/open` leaves off the app's no-purchase mark for these links (`client=web`), and sets the workspace cookie (`ws`). The website still opens a workspace only if the person belongs to it.
- Owners and admins only. A workspace billed through the App Store is sent to the App Store instead.
- The app's US links now use it, so paying on the website is the plan's checkout, a tick and a card, not a sign-in first.

**When the App Store has no plans to show,** the Plans screen says so and offers Try again, instead of a dead end.

## Consequences

**iPhone:**
- **Steps left:**
  1. One screenshot of the Plans screen from build 40, uploaded as each subscription's review screenshot.
  2. **Add for Review** on each subscription.
  3. Submit version 1.1.0, which is ready in App Store Connect with build 40, its What's New and review notes.
- **When Apple approves it,** 1.1.0 releases by itself and its plans work at once.
- **The app changes in this stage** (the signed-in website link and Try again) ship with the next build. The Mac build can't run until GitHub's free Actions minutes reset on 2026-12-01, unless the owner allows a budget.

**Android:**
- **Steps left:**
  1. Send 1.1.0 to the closed test.
  2. Run `set-google-play.ps1` once. It saves a key, so it's the owner's.
  3. Production access, from about 2026-11-19.

**Prices:**
- **Lite in the stores:** it stays $0.99 in both, while the web is $1 (ADR 0185). App Store Connect showed no way to change a subscription's starting price before its first review.
- **Prices for 30% fees:** the App Store prices assume the Small Business Program's 15%. If Apple hasn't accepted the enrolment, the larger plans keep less than 57% in their first year (`apple.test.ts`).
