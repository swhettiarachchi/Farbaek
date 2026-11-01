# Stage 130: The store listings, and nothing sold inside the Android app

- **Branch:** `feat/android-store-ready`, stacked on `feat/linux-agent-live` (stage 129).
- **Migration:** none.
- **ADR:** 0150.

## 2026-11-01

### Done

- **App Store 1.0.0, in App Store Connect:**
  - six screenshots in the "iPhone with Dynamic Island (medium display)" slot. They're the sample tour from build 17, scaled from 1320 × 2868 to 1206 × 2622, and each shows the "Sample data" labels;
  - build 17 attached to the version, and saved;
  - the price: free in all 175 countries or regions;
  - availability: all 175 countries or regions.

  Apple's "Add for Review" check now lists only the owner's steps:
  - App Privacy, which an Admin must publish;
  - a phone number for the review contact;
  - three screenshots still processing on Apple's side.

  Already done before this stage: the age rating (13+), content rights, the categories (Developer Tools, Productivity), the description, keywords and URLs.
- **Google Play:**
  - **Create app:** filled in under the Svanflok account: Farbaek, `com.farbaek.app` ("Package name available"), English (United States), App, Free. Auto mode refused ticking the two declarations. The owner ticked them, and Claude created the app (Play app id 4974194295109432147).
  - **Saved in Play Console:**
    - Store settings: Productivity, the support email and the website;
    - the default store listing: both descriptions, the icon, the feature graphic and six screenshots;
    - the privacy policy URL.

    The other App content declarations are the owner's.
  - **The listing:** written in `docs/mobile/play-listing.md`: the short and full descriptions, store settings, and the facts for App access, content rating, target audience and Data safety.
  - **Graphics** (in `desktop/release/store-android/`, not in the repository):
    - a 512 × 512 32-bit icon from the app icon;
    - a 1024 × 500 feature graphic: the logo unaltered, the tagline, tokens only;
    - six 1080 × 1920 phone screenshots of `/app` from a local demo build, each with the "Demo workspace. Sample data only." band.
- **Nothing sold inside the Android app (ADR 0150).** Google Play's Payments policy allows digital plans in an app only through Google Play's billing, and forbids pointing people to another checkout from inside the app. So:
  - `src/core/billing/store-client.ts` recognises the app by its referrer (`android-app://com.farbaek.app`) or its launch address (`?client=android-app`, now in `AndroidManifest.xml`);
  - `AndroidAppMarker`, in the root layout, has the tab remember it in `sessionStorage`. That isn't shared with the person's ordinary Chrome tabs, as a cookie would be;
  - `WebPurchaseOnly` replaces each buy control there:
    - the plan cards' Choose, Upgrade and Switch on Billing and Pricing;
    - the yearly options;
    - the usage top-up packs;
    - Keep a cancelled plan;
    - the payment-method portal;
    - a purchase step reached by its address.

    In their place is "Can't be bought in the Android app", and nothing says where else to buy.
  - **Unchanged:** cancelling, usage and the current plan.
- **Microsoft Store:** still "In certification" (submitted 2026-10-31). It publishes by itself when it passes.

### Verified

- `src/core/billing/store-client.test.ts`:
  - the referrer, with and without a path;
  - the launch address;
  - a lookalike package and another client aren't matched;
  - the tab's memory.
- `pnpm typecheck`, ESLint on the changed files, and `tests/design` (145 tests with the new file).
- **A demo build in the browser:**
  - `/pricing` offers Choose and Pay yearly;
  - `/pricing?client=android-app` shows the pill on every paid plan, with Start free kept;
  - after a reload in the same tab it still does;
  - a new tab is unaffected;
  - no console errors, and no sideways scroll at 375px.

### Not verified

- **The gate inside the real app:** the Android bundle hasn't been built yet, because it waits for the upload key.
- **The Billing page's gated buttons:** the demo workspace has payments not connected, so its plan cards show "Unavailable until payments open" before they reach the buy links. The same `WebPurchaseOnly` wraps them.

### Next

- **The owner, for the App Store:**
  - App Privacy (the data types are in `docs/mobile/ios.md`, step 7);
  - the review contact's phone number;
  - Add for Review, then Submit.
- **The owner, for Google Play:**
  - the App content declarations, from `docs/mobile/play-listing.md`;
  - run `scripts/release/android-signing.ps1`;
  - then Claude builds the bundle, fills in the listing, and the closed test starts.
- **Merge:** #156 first, then this branch.
