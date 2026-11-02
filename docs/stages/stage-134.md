# Stage 134: A calm Billing page in Farbaek for Android

- **Branch:** `design/android-billing-calm`.
- **Migration:** none.
- **ADR:** none new. ADR 0150 records the update.

## 2026-11-02

### Asked

The owner compared the iPhone app's You tab with the Android app's Billing page. The iPhone shows the plan, and in the US "Upgrade or manage your plan". The Android page repeated "Can't be bought in the Android app" under every plan. They asked for the Android app to be set up like the iPhone, in an easy, attractive, professional way.

### Checked

- **The iPhone app** shows its website link only when the App Store country is the United States (`WebPurchase.allowed()`, guideline 3.1.1(a)). Elsewhere it shows the plan and nothing about buying.
- **Google Play** allows a link out to pay only for US users, through its External Content Links program:
  - enrolment;
  - Google's notice screen through the Play Billing Library;
  - reporting each sale;
  - a fee, reported as 10% for subscriptions.

  Elsewhere, a link breaks the Payments policy.
- **The owner's choice:** given those options, keep selling nothing in the Android app, and make it look right.
- **Google Play billing** (built and tested the same day) is kept on the local branch `feat/google-play-billing`. It wasn't pushed or applied.

### Done

- **Billing inside the Android app:**
  - one notice, "Plans aren't sold in the Android app": the plan, its usage and its renewal date are all here;
  - then "What each plan includes", one list of the plans with their sessions, sandbox hours and seats, and the workspace's plan marked "Current" (or "Trial");
  - no prices, no buttons and no pills;
  - the top-up card is left out;
  - the invoices line reads "No invoices.".
- **The pricing page inside the app** shows the same notice once, above the plans, and the plan cards no longer carry a pill.
- **ADR 0150** gains an update section.
- **On the website,** everything is as before.

### Verified

- `pnpm typecheck`.
- ESLint on the changed files.
- `vitest` on `tests/design` and `src/components`: 26 files and 216 tests.
- **A demo build at 375px in headless Chrome:**
  - **Billing inside the app** (`?client=android-app`): the notice and the plan list, Pro marked "Trial", 0 pills, no top-up card, no console errors, no sideways scroll;
  - **Pricing inside the app:** the notice once, 0 pills;
  - **Billing on the web:** the plan cards and "Prices in USD." as before, with no notice.
