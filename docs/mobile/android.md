# Farbaek for Android on Google Play: the owner's steps

Farbaek for Android is a Trusted Web Activity (ADR 0099): the app opens www.farbaek.com/app full screen in Chrome. `android/` is the app, `.github/workflows/android.yml` builds it, and `/.well-known/assetlinks.json` tells Chrome the app and the site belong together.

## 1. The upload key (once, about 2 minutes)

In PowerShell:

```
powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\release\android-signing.ps1"
```

1. It makes the key in `C:\Users\INTEL\FarbaekAndroidSigning` and prints the **upload certificate SHA-256**. Send that line to Claude: it's public and goes into `src/config/android-app.ts`.
2. GitHub's New secret page opens. For each of the two secrets:
   - press **Enter** in PowerShell, which copies the name, then paste it into **Name**;
   - press **Enter** again, which copies the value, then paste it into **Secret**;
   - click **Add secret**.
3. Don't copy anything else or take a screenshot until it says Done.
4. Back up `C:\Users\INTEL\FarbaekAndroidSigning`, for example on a USB stick. Every update needs the same key.

## 2. The bundle

GitHub builds it whenever `android/` changes, or from **Actions → Android app → Run workflow**. That works from November 1, when the free minutes reset.

Download the run's **farbaek-android** artifact. It holds `farbaek-1.0.0.aab` and its SHA-256.

## 3. Play Console

The texts, graphics and answers are in `docs/mobile/play-listing.md`. Plans are sold inside the app only through Google Play (ADR 0150, ADR 0154, section 4), so the listing never mentions prices or another way to pay.

**Where it stands (2026-11-01):**
- **The app:** created under the Svanflok account (u/5): Farbaek, `com.farbaek.app`, Play app id 4974194295109432147. The owner accepted the declarations.
- **Done by Claude:**
  - **Store settings:** Productivity, `support@farbaek.com` and `https://www.farbaek.com`;
  - **the default store listing:** both descriptions, the icon, the feature graphic and the six screenshots;
  - **Privacy policy:** the URL.
- **Answered by the owner, with Claude checking each page:**
  - Sign in details: `hello@farbaek.com`, with the robots' toggle off;
  - Ads: none;
  - Content rating: Everyone, PEGI 3, USK 0 and IARC 3+, with "Users Interact";
  - Target audience: 13 and over;
  - Data safety: imported from `docs/mobile/play-data-safety.csv`.

  Auto mode refuses Claude making declarations.
- **Still open:** Advertising ID (No), Government apps, Financial features and Health apps (none).
- **Testers:** the closed track "Closed testing - Alpha" uses the owner's email list "MY" (13 people). They join with the link Play shows after the first release, and at least 12 must stay joined for 14 days.
- **Signing:** the owner ran `android-signing.ps1`, and both secrets are on GitHub. Run #6 builds the first signed bundle.

1. **Create the app.** In play.google.com/console, choose **Create app**:
   - name **Farbaek**, default language English (United States);
   - **App**, **Free**;
   - accept the declarations.
2. **Set up your app:** complete the tasks Play lists, from **App content** in `docs/mobile/play-listing.md`:
   - **Privacy policy:** `https://www.farbaek.com/privacy`;
   - **App access**, with the sign-in note for reviewers;
   - **Ads:** No;
   - **Content rating:** "All other app types"; users interact;
   - **Target audience:** 13 and over, matching the Terms and the App Store's 13+;
   - **Data safety:** the table there;
   - **Category:** Productivity;
   - **Contact email:** `support@farbaek.com`.
3. **Store listing:** the description and the files in `desktop/release/store-android/`, as `docs/mobile/play-listing.md` lists:
   - **App icon:** `play-icon-512.png`;
   - **Feature graphic:** `play-feature-graphic.png`;
   - **Phone screenshots:** the six `play-phone-*.png`.
4. **Testing → Closed testing:** create a track and add at least **12 testers** (their Google account emails). Upload the `.aab`. Google requires new personal accounts to run this test for **14 days** before production.
5. **App signing:** after the first upload, open **Test and release → App integrity → App signing** and copy **App signing key certificate, SHA-256 certificate fingerprint**. Send it to Claude: it goes into `src/config/android-app.ts` next to the upload key's. Once it's live, the app opens without Chrome's address bar.
6. After the 14 days, **apply for production**, then roll out.

## 4. Selling plans in the app (ADR 0154)

Inside the app, plans are bought through Google Play, the way Farbaek for iPhone buys through the App Store. The website shows Google Play's prices and opens Google Play's purchase sheet. The server checks every purchase with Google before the plan changes.

**Where it stands (2026-11-11, ADR 0186):**
- **Built:** stage 134, app version 1.1.0 (versionCode 3).
- **Selling opens by itself once step 4 saves the key:** the server's switch is on unless `GOOGLE_PLAY_BILLING=off`. Step 8 is no longer needed.
- **Steps 1 to 3 and 5 are done.** The service account is `farbaek-play-billing@farbaek-play.iam.gserviceaccount.com` in the Google Cloud project `farbaek-play`, and Play Console shows it Active. On 2026-11-03, step 4's test passed Google's sign-in, but Google Play didn't let the account read purchases yet, so nothing was saved; run step 4 again once Google's access starts working.

1. **Payments profile.** Play Console → **Settings → Payments profile**. Create it (merchant, bank account and tax details). Only you can: it's your money. Sri Lanka supports merchant registration.
2. **A service account for Farbaek's server:**
   1. In console.cloud.google.com, signed in with the Farbaek Google account, create a project named "Farbaek Play".
   2. Turn on the **Google Play Android Developer API** (APIs and services → Library).
   3. **IAM and admin → Service accounts → Create**, named "Farbaek Play billing" (`farbaek-play-billing`), with no Cloud roles.
   4. Open it, **Keys → Add key → JSON**. The file downloads once. Keep it private.
3. **Give it Play access.** Play Console → **Users and permissions → Invite new users**:
   - the service account's email (it ends `.iam.gserviceaccount.com`);
   - under **Account permissions** (Farbaek is the account's only app);
   - **View financial data** and **Manage orders and subscriptions**.

   Its access can take up to a day to start working.
4. **Save it on the server:**

   ```powershell
   powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-google-play.ps1"
   ```

   Drag the JSON file in when it asks. The script tests it from the server and saves it only if Google and Google Play both accept it. Then delete the downloaded file.
5. **The five subscriptions.** Play Console → **Monetize with Play → Products → Subscriptions**. Claude can fill these in. Each has one base plan, `monthly`: auto-renewing, monthly, no offers, pausing off.

   | Product id | Name | US price |
   | --- | --- | --- |
   | `farbaek_lite_monthly` | Farbaek Lite | $1.00 (from $0.99 on 2026-11-11, ADR 0185) |
   | `farbaek_maker_monthly` | Farbaek Maker | $1.99 |
   | `farbaek_starter_monthly` | Farbaek Starter | $10.49 |
   | `farbaek_plus_monthly` | Farbaek Plus | $20.99 |
   | `farbaek_pro_monthly` | Farbaek Pro | $53.99 |

   Play converts the other countries' prices. Check them: where prices include VAT, Farbaek keeps less.
6. **License testers.** Play Console → **Settings → License testing**: add your own Gmail accounts. Their purchases are free test purchases, recorded in test mode.
7. **The 1.1.0 bundle and declarations:**
   - Upload the bundle from the "Android app" workflow run (versionCode 3) to **Closed testing - Alpha**.
   - Answer **Financial features** (none of the listed ones: it sells subscriptions to its own service).
   - Check that **Data safety** still lists Purchase history.
8. **On by itself (ADR 0186):** once step 4 saves the key, Billing in the app shows the plan picker with Google Play's prices after the restart. `-TurnOn` only starts it again after `-Off`. Before that, send 1.1.0 to the closed test, or testers on 1.0.1 see "Update the app in the Play Store".
9. **Test end to end** with a license tester, on the closed test:
   1. Buy Lite.
   2. Billing shows "Billed through Google Play".
   3. Play Console → **Order management** shows the order acknowledged.
   4. Cancel it in Google Play: within the hour, or when the app opens, Billing shows it ending.

`-Off` stops selling. Purchases already made keep being checked every hour.

## 5. Nearby (ADR 0193), from 1.3.1 (versionCode 6)

The app's first native screen: it sends files to a computer on the same Wi-Fi with no internet.

It pairs only with pairing v2 (ADR 0194). The desktop app has that from 0.11.0, so publish desktop 0.11.0 first. Desktop 0.10.0 can't pair with this phone, and the phone asks for the update.

Before releasing it:

1. **The bundle:** upload the one from the "Android app" workflow run (versionCode 6) to **Closed testing - Alpha**. Never versionCode 5 (1.3.0): it was built but not uploaded, and its Nearby could stay on "Starting Nearby…" on a quiet Wi-Fi. Check the run's **Android launch check** first. Its summary should show:
   - Nearby opening;
   - the service in the foreground;
   - no crash.
2. **Foreground service declaration.** Play Console → **App content → Foreground service permissions**:
   - **Type:** Data sync.
   - **What it does:** "Moves files the person chose between this phone and their own paired computer on the same Wi-Fi, with progress in a notification, so a transfer finishes with the screen off."
   - **Task:** under Network processing, Other.
   - **Video:** `https://www.farbaek.com/media/play/nearby-foreground-service.mp4`. It's the Android launch check's own recording (run 25, Android 14): Nearby opens, Visible is turned on, and the ongoing "Visible to your computers on this Wi-Fi" notification shows. If Google asks for a transfer too, record one on your phone once 1.3.1 is installed.
3. **Data safety:** nothing new is collected. The files go from the phone to the person's own computer, and nothing about them reaches Farbaek.
4. **The first real check,** with your phone and your computer on the same Wi-Fi:
   1. In the desktop app, open Nearby and choose **Be visible**.
   2. In the Android app, open Mesh, then **Open Nearby**.
   3. Pair, checking the six digits match on both screens.
   4. Send a photo.
   5. Then turn off mobile data and the router's internet (Wi-Fi still on), and send another. It should arrive just the same.

### Nearby redesigned: 1.3.2 (versionCode 8)

Stage 187 redesigned the Nearby screen. The node and its protocol are unchanged, so it pairs and sends exactly as 1.3.1 does.

1. **Check:** before uploading, open the **Android launch check** run for the merge. Its artifact has `screens/`, one picture of each state from the debug build's samples.
2. **Your phone first:** upload the bundle from the "Android app" workflow run for the merge (versionCode 8; 7 was built but never uploaded, so skip it) to **Internal testing**. The "UVelsi internal" list gets it with no review wait, so your phone can update within minutes.
3. **Testers:** after that, add the same bundle to **Closed testing - Alpha** and send it for review.

### Arrivals go where people look: 1.4.0 (versionCode 9)

Stage 188 (ADR 0196). Received files are copied into Gallery (`Pictures/Farbaek`) or Downloads (`Download/Farbaek`) after they're checked, when **Save to Gallery and Downloads** is on (the default, Android 10 and later). The offer says where they will go before Accept. Offers and arrivals get notifications on a new channel, "Files from your computers".

1. **Check:** the **Android launch check** run for the merge, with its `screens/` pictures, including `offer`, `kept`, `saving`, `arrived`, `received` and `notifications.png`.
2. **Your phone first:** upload the "Android app" bundle (versionCode 9) to **Internal testing**. Then try it:
   - send three photos and a PDF from the computer to the phone;
   - the photos should land in Gallery › Farbaek, and the PDF in Downloads › Farbaek;
   - a notification should say where each went;
   - force-stop the app during a large copy, open it again, and check nothing is doubled.
3. **Play Console, before the closed test:**
   - **Data safety:** nothing changes. Files still go only from your computer to your phone and are saved on the phone; nothing reaches Farbaek.
   - **Permissions:** the app asks for none for storage, because Android 10 and later let an app save its own files into Gallery and Downloads.
4. **Testers:** add the same bundle to **Closed testing - Alpha** and send it for review.

## Updating the app

Most changes need no app update: the app is the website. Only change `android/` for the app shell, and raise `versionCode` in `android/version.properties` for each upload.

Every change to `android/` also runs **Android launch check** (`.github/workflows/android-launch.yml`). It installs the release APK on an Android 14 emulator with Chrome and opens it. Its summary shows:
- the activity on screen afterwards;
- the number of crashes;
- the first crash's stack trace.

Don't upload a bundle whose check shows a crash. Version 1.0.0 stopped at launch on every phone because `ManageDataLauncherActivity` wasn't declared (androidbrowserhelper 2.7 turns it on or off at each launch). Keep the manifest's components in step with [Bubblewrap's template](https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/core/template_project/app/src/main/AndroidManifest.xml) when androidbrowserhelper is raised.
