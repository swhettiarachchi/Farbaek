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
   - **Sign in with Farbaek**. The sheet opens www.farbaek.com: sign in, then **Connect this iPhone**.
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
   - Identifiers: Device ID (the notification token).
3. Fill in **App Review Information**:
   - untick **Sign-in required**;
   - **Notes:** "Tap Look around with sample data on the first screen to see every screen with sample data. Signing in uses a one-time email link from www.farbaek.com in the system browser sheet. The app has no purchases."
4. Choose **Add for Review**, then **Submit**.

## What's already done

- **The app:** sign-in through the web with PKCE, approvals with diffs and Face ID, builds from one sentence, live runs and their questions, tasks, notifications, the sample, sign-out and account deletion through the web.
- **The server:** `/api/v1/app`, migration v70, Settings > Phones, and APNs, which waits for your key.
- **Tests:** the server's tests, and the app's tests against the server's real sample answers.
- **Not yet:** the app hasn't been compiled. The first run of step 5 is its first build.
