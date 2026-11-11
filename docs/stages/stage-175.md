# Stage 175: Buying in the apps

- **Branch:** `feat/store-purchases`, on `feat/lite-price` (#221).
- **ADR:** 0186. No migration.
- **Skills:** `chrome-browser` for App Store Connect and GitHub, `mobile-app-ui-design` and `premium-app-ui` for the purchase flow, `farbaek-human-made` for the words.

## What the owner asked

"In-app payments are still not available to users." Let people upgrade inside the iPhone and Android apps in as few steps as possible. If that's impossible, send them to the website's checkout. Choose and build what's best.

## What was found

- **Both apps already had purchases built:** StoreKit on the iPhone (ADR 0112), Google Play's billing on Android (ADR 0154). Server switches held them back, and so did store steps nobody had finished.
- **App Store Connect:** 1.0.0 is approved and live. The five subscriptions were still "Prepare for Submission", and Apple takes a first subscription only with a new version. Build 40 (1.1.0) was in TestFlight.
- **GitHub Actions:** every run since about 2026-11-08 failed at once: "recent account payments have failed or your spending limit needs to be increased". It isn't a failed payment: the account's free monthly minutes, shared with the owner's other repositories, ran out, and the budgets are $0. So no new iPhone build can be made until the allowance resets on 2026-12-01, unless the owner allows a small Actions budget.
- **Store rules:** a link to the website's checkout is allowed only in the US App Store, and on Android only for US users through a separate program. The store's own purchase is allowed everywhere, and it's also the shortest: one tap and Face ID, or Google Play's sheet.

## What changed

**Selling opens by itself (ADR 0186).**
- **App Store:** on unless `APPLE_IAP=off`. Offered only to builds from 1.1.0 (40), read from the User-Agent iOS gives the app, so 1.0.0 users never meet an empty plans screen.
- **Google Play:** on unless `GOOGLE_PLAY_BILLING=off`, once the service account's key is saved.
- **The reviewers' account can test-buy.** A workspace whose only member is hello@farbaek.com counts for free test purchases, so App Review's purchase applies.
- **The switches stop new purchases only:** Apple's notifications and the hourly Google Play check keep running for purchases already made.
- **New builds state their own build** in `X-Farbaek-App`, and an unreadable build is logged.
- **`set-google-play.ps1`** warns that selling opens as soon as the key is saved, and asks that 1.1.0 is in the closed test first.

**The US website link opens checkout signed in.**
- **New route:** `POST /api/v1/app/billing-link` returns a one-time sign-in link to Billing, on the phone's workspace. It opens at the plan's checkout, or at Billing itself when the workspace already pays on the web or through Google Play.
- **`/auth/open`:** leaves off the app's no-purchase mark for these links and sets the workspace.
- **iPhone app:** You, the Plans screen and the "See plans" button after a limit use it (`WebPurchaseButton`). They show it only in the US App Store and not for a plan billed through Apple.
- **No dead end:** the Plans screen offers Try again when the App Store sends no plans.

**App Store Connect, done in the owner's Chrome:**
- version 1.1.0 created with build 40;
- What's New;
- review notes rewritten: where the plans are, what a sandbox purchase does, Apple In-App Purchase listed among the services, and the 1.0.0 screen recording note removed because it isn't attached to 1.1.0;
- automatic release kept.

## Verified

- **Unit tests:**
  - reading the build;
  - which builds sell plans;
  - both switches' defaults;
  - the phone API passes the build;
  - the billing link: choose or change, Apple-billed refused, plan list for anything else, refused without sign-in.
- **Checks:** `pnpm typecheck`, `pnpm lint` and the whole `pnpm test`.
- **An independent review** found no security hole in the sign-in link, the workspace cookie or the billing link. It found five problems, all fixed:
  - **The reviewers' account rule trusted a password that isn't private.** It now counts only a workspace whose only member is that account.
  - **Google-billed workspaces were sent to a plan change the web refuses.** They now land on Billing.
  - **The off switches also stopped syncing existing purchases.** They now stop new purchases only.
  - **A User-Agent that stopped matching would have hidden the plans silently.** New builds now state their build, and a miss is logged.
  - **The Play key script could open selling before 1.1.0 was in the closed test.** It now asks first.
  
  After the fixes, the 260 billing, phone and job tests pass, along with the type check and lint.
- **App Store Connect:** reloaded after saving, version 1.1.0 holds build 40, the new notes (3,965 of 4,000 characters) and What's New.
- **Not checked here:** the Swift changes. They compile on the next "iPhone app" workflow run, which waits for GitHub's minutes. Build 40 doesn't need them to sell plans.

## For the owner, in order

1. **Merge #221, then this PR.** Production deploys by itself.
2. **GitHub Actions** stays refused until the free minutes reset on 2026-12-01, including the uptime check and the iPhone build. Build 40 doesn't need a new build to sell plans, so this can wait. To build sooner, allow a small Actions budget in GitHub, Settings, Billing and licensing, Budgets: Mac minutes count ten times.
3. **On your iPhone, in TestFlight build 40:** You, then Choose a plan. Take one screenshot of the Plans screen and send it to this PC. Claude uploads it as each subscription's review screenshot and presses Add for Review on all five.
4. **Submit version 1.1.0 for review** in App Store Connect. It releases by itself once Apple approves.
5. **Android:**
   1. In Play Console, send 1.1.0 to Closed testing, with the release already saved there.
   2. Run `set-google-play.ps1` with the service account's key file. Selling opens when it finishes.
   3. Apply for production from about 2026-11-19.
6. **Check Apple's email about the Small Business Program.** The App Store prices assume Apple keeps 15%.

## Not done

- **Lite in the stores** stays $0.99, while the web is $1. App Store Connect showed no way to change a subscription's price before its first review. The two stores must match, so Google Play stays $0.99 too.
- **No real purchase was made.** App Review's sandbox purchase is the first real test of the flow on the server.
