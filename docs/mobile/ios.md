# Farbaek for iPhone: the owner's steps

The app is in `ios/` and its decision is ADR 0110. GitHub's Mac builds and tests it; these steps are the parts only the Apple account holder can do. Do them in order. No step needs a Mac.

## 1. Register the app's ID (5 minutes)

1. Open developer.apple.com/account and sign in.
2. Go to **Certificates, Identifiers & Profiles**, then **Identifiers**, then the **+** button.
3. Choose **App IDs**, then **App**, then **Continue**.
4. Fill in:
   - **Description:** `Farbaek`;
   - **Bundle ID:** Explicit, `com.farbaek.app`;
   - **Capabilities:** tick **Push Notifications**.
5. Choose **Continue**, then **Register**.

## 2. Create the app in App Store Connect (5 minutes)

1. Open appstoreconnect.apple.com, then **Apps**, then **+**, then **New App**.
2. Fill in:
   - **Platform:** iOS;
   - **Name:** `Farbaek` (if it's taken, `Farbaek: Build and Approve`);
   - **Primary language:** English (U.S.);
   - **Bundle ID:** `com.farbaek.app`;
   - **SKU:** `farbaek-ios`;
   - **User access:** Full Access.

## 3. A key for GitHub to upload builds (5 minutes)

1. In App Store Connect, go to **Users and Access**, then **Integrations**, then **App Store Connect API**, then **Team Keys**, then **+**.
2. Name it `Farbaek iPhone builds` and set **Access** to **Admin**. Apple's cloud signing needs Admin.
3. Choose **Download**. Apple gives the `.p8` file only once.
4. Note the **Key ID** (shown next to the key) and the **Issuer ID** (at the top of the page).
5. In GitHub, go to the repository's **Settings**, then **Secrets and variables**, then **Actions**, then **New repository secret**, three times:
   - `IOS_ASC_KEY_P8`: open the `.p8` file in Notepad and paste all of it;
   - `IOS_ASC_KEY_ID`: the Key ID;
   - `IOS_ASC_ISSUER`: the Issuer ID.

## 4. Notifications on the server (5 minutes, after the app's change is merged)

1. In **Certificates, Identifiers & Profiles**, go to **Keys**, then **+**.
2. Name it `Farbaek push`, tick **Apple Push Notifications service (APNs)**, then **Continue** and **Register**.
3. Choose **Download** to get `AuthKey_XXXXXXXXXX.p8`. Apple gives it only once.
4. In your own PowerShell window, run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-apns.ps1"
   ```

5. Drag the `.p8` file into the window when it asks. The script saves the key on the server and restarts the app.

## 5. The first build (from 1 November, when GitHub's free minutes return)

1. In GitHub, go to **Actions**, then **iPhone app**, then **Run workflow**.
2. Tick **Upload to TestFlight**, then choose **Run workflow**.
3. The run:
   - builds the app;
   - runs its tests;
   - tours the sample on a simulator and keeps the screenshots as the run's artifact;
   - signs the app and uploads it.

   It takes about 15 minutes.
4. App Store Connect emails you when the build is processed, about 10 to 30 minutes later.

## 6. Try it on your iPhone (10 minutes)

1. In App Store Connect, open **Farbaek**, then **TestFlight**, then **Internal Testing**, then **+**. Make a group and add yourself.
2. Install **TestFlight** from the App Store on your iPhone, and open the invitation email.
3. In the app, check each of these:
   - **Sign in with email**. The sheet opens www.farbaek.com: sign in, then **Connect this iPhone**.
   - **You**, then **Turn on notifications**. Start a build on the web; the notification arrives when it finishes.
   - **Approvals**. Open a change and approve it with Face ID.
   - On the web, **Settings**, then **Phones**. The phone is listed; **Disconnect** signs the app out.

## 7. Submit for review (30 minutes)

1. In App Store Connect, open **Farbaek**, then the **1.0** version, and fill in:
   - **Screenshots:** the six from the build's artifact (6.9-inch);
   - **Description:** "Approve what your agent builds, wherever you are. Farbaek for iPhone shows every change as a diff, with its checks and hash, and applies it only when you confirm with Face ID. Start a build from one sentence, approve its plan, follow the agent live and answer its questions. Notifications tell you when a build finishes or its checks end. Requires a Farbaek account from www.farbaek.com.";
   - **Keywords:** `ai,agent,build,approve,code review,diff,developer,websites`;
   - **Support URL:** `https://www.farbaek.com` (its footer has the support email);
   - **Privacy Policy URL:** `https://www.farbaek.com/privacy`.
2. Fill in **App Privacy**, then **Data types**, each "Used for App Functionality", "Linked to you", and not used for tracking:
   - Contact Info: Email Address;
   - User Content: Other User Content;
   - Identifiers: User ID (the Farbaek account) and Device ID (the notification token);
   - Purchases: Purchase History (the plan bought in the app, ADR 0112).
3. Fill in **App Review Information**:
   - untick **Sign-in required**;
   - **Notes:** "Tap Look around with sample data on the first screen to see every screen with sample data. Signing in uses a one-time email link from www.farbaek.com in the system browser sheet. Plans can be bought with In-App Purchase in You, Choose a plan; a sandbox purchase applies to the signed-in workspace."
4. Leave **Pricing and Availability**, then **iPhone and iPad Apps on Apple Silicon Macs** switched on: Macs with Apple silicon get the same app from the Mac App Store.
5. Choose **Add for Review**, then **Submit**.

## 8. Selling plans in the app (ADR 0112)

Buying in the app is one tap with Face ID, in every country. Do these in order; until the last one, the app doesn't offer plans.

**Where it stands (2026-10-29):** steps 1, 3 and 4 are done. The Paid Apps Agreement, bank account and tax forms are Active. Claude made the group and the five plans in App Store Connect, with prices, all 175 countries, names, descriptions, and App Store only (no multiseat, so every purchase goes through the app and names its workspace). Claude also set both notification URLs. Step 2 was submitted by the owner on 2026-10-29; Apple confirms by email. Still to do: each plan's review screenshot (after the first build), then step 5 and step 6.

1. **Paid Apps Agreement** (done, Active from 2026-10-29). In App Store Connect, go to **Business**, then **Paid Apps Agreement**. Add your bank account, the tax forms (W-8BEN, as a non-US individual) and contacts, then accept it.
2. **Small Business Program.** Go to developer.apple.com/app-store/small-business-program and choose **Enroll**. It's free, and Apple keeps 15% instead of 30%. The iPhone prices are set for 15%.
3. **The plans** (done by Claude, 2026-10-29; group id 22526396). In App Store Connect, open **Farbaek**, then **Subscriptions**, then **+**. Make a group named `Farbaek plans` and add five subscriptions, each with duration **1 month**:

   | Reference name | Product ID | US price |
   | --- | --- | --- |
   | Lite | `com.farbaek.app.lite.monthly` | $0.99 |
   | Maker | `com.farbaek.app.maker.monthly` | $1.99 |
   | Starter | `com.farbaek.app.starter.monthly` | $10.49 |
   | Plus | `com.farbaek.app.plus.monthly` | $20.99 |
   | Pro | `com.farbaek.app.pro.monthly` | $53.99 |

   Each needs:
   - a **display name** (the plan's name);
   - a **description**, for example "More AI usage and sandbox time each month.";
   - a **review screenshot** (the You tab from the build's screenshots).

   Order them in the group from Pro (level 1) down to Lite.
4. **Notifications from Apple** (done by Claude, 2026-10-29; Apple now always uses Version 2). In **App Information**, under **App Store Server Notifications**, set both URLs to `https://www.farbaek.com/api/webhooks/apple` with **Version 2**.
5. **Name the workspace for test purchases (ADR 0175).** A purchase in Apple's sandbox, which is what TestFlight and App Review use, is free, so it only counts for workspaces in `BILLING_TEST_WORKSPACES`. Add the review account's workspace id there, or Apple's reviewers will buy a plan and see nothing change.
   **Turn it on.** Ask Claude, or run:

   ```bash
   ssh -i "$HOME\.ssh\farbaek_vps" farbaek@2.25.88.188 "echo APPLE_IAP=on | farbaek-set-env && farbaek-deploy --again"
   ```

6. Submit the five subscriptions with the next app version.

## 9. Sign in with Apple (ADR 0113, 5 minutes)

The app shows **Continue with Apple** only once these are done.

1. **The capability.** In **Identifiers**, open `com.farbaek.app`, tick **Sign in with Apple** (leave it as a primary App ID), then **Save** and **Confirm**. The next build's profile picks it up.
2. **The key.** In **Keys**, choose **+**, name it `Farbaek sign in`, tick **Sign in with Apple**, choose **Configure**, pick the App ID `com.farbaek.app`, then **Save**, **Continue**, **Register** and **Download**. Apple lets you download it once, as `AuthKey_XXXXXXXXXX.p8`. Keep it with the push key, out of the repository.
3. **Turn it on.** In your own PowerShell window, run the line below and drag the file in when it asks. It switches on Apple in Supabase Auth, saves the key on the server and restarts the app. Nothing is shown on screen.

   ```bash
   powershell -ExecutionPolicy Bypass -File "C:UsersINTELDocumentsFarBaekscriptspsset-apple-sign-in.ps1"
   ```

The key lets the server revoke a person's Apple sign-in when they delete their account, as Apple requires. That's why the button stays hidden until the key is in place.

Someone who chooses **Hide My Email** gets a separate account from one they already made with their real address. To use the existing account, they choose **Share My Email**, or sign in with email.

## What the app has, and what it links to (ADR 0173)

- **Native:** Home, Approvals, Build, Projects, You; a task with its next step; plans, changes and runs; permission before AI; Report this result.
- **Opening right here, in the system's in-app browser, already signed in (ADR 0177):** Test space, Desktop app, Move projects, Workflows, Rules, Problems and pause, History, Connections, Who can do what, Settings. Previewing and editing a site too, because a generated site can't run in the app (guideline 2.5.2).
- **Decided (2026-11-06):** sell plans in the app with the next version, the research's recommendation (`reports/Hybrid iOS rules and premium UX.md`), so plans are bought the way Apple requires and every screen can open up later.
- **App Review consultation:** the appointments on Nov 10-11 and Nov 12-13 are full. Requests for Nov 17-18 open on Nov 8 at 1:30 PM Sri Lanka time, at developer.apple.com/events/view/NLT5YC7N7L/dashboard. Showing the linked tools inside the app waits for that meeting. The request:

  > App Apple ID 6828344835. Farbaek builds websites from a sentence, with a person approving each change. The iPhone app has native Home, Approvals, Build, Projects and You screens. We'd like to discuss showing the rest of the signed-in product (test space, rules, history, connections, settings) in authenticated web views, alongside native In-App Purchase, with no prices or purchase links inside those views. Which parts of guidelines 4.2, 4.7 and 3.1.3(b) should we pay attention to?

## What's already done

- **The app:** Sign in with Apple (step 9 done 2026-10-29), sign-in through the web with PKCE, approvals with diffs and Face ID, builds from one sentence, live runs and their questions, tasks, notifications, the sample, sign-out and account deletion through the web.
- **The server:** `/api/v1/app`, migration v70, Settings > Phones, and APNs, which waits for your key.
- **Tests:** the server's tests, and the app's tests against the server's real sample answers.
- **Not yet:** the app hasn't been compiled. The first run of step 5 is its first build.
