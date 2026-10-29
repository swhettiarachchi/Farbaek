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

1. **Create the app.** In play.google.com/console, choose **Create app**:
   - name **Farbaek**, default language English (United States);
   - **App**, **Free**;
   - accept the declarations.
2. **Set up your app:** complete the tasks Play lists.
   - **Privacy policy:** `https://www.farbaek.com/privacy`
   - **App access:** "All or some functionality is restricted", with a note that reviewers can sign up at https://www.farbaek.com/sign-in.
   - **Ads:** No.
   - **Content rating:** the questionnaire, answering No to everything (category Utility, productivity, communication or other).
   - **Target audience:** 13 and over, matching the Terms and the App Store's 13+.
   - **Data safety:** email address (account), app interactions; encrypted in transit; people can delete their account (Settings in Farbaek).
   - **Category:** Productivity.
   - **Contact email:** `support@farbaek.com`
3. **Store listing:**
   - **App icon:** `public/brand/farbaek-app-512.png`.
   - **Feature graphic (1024×500) and phone screenshots:** take them from www.farbaek.com on a phone.
   - **Short description:** "From idea to verified software, with control at every step."
4. **Testing → Closed testing:** create a track and add at least **12 testers** (their Google account emails). Upload the `.aab`. Google requires new personal accounts to run this test for **14 days** before production.
5. **App signing:** after the first upload, open **Test and release → App integrity → App signing** and copy **App signing key certificate, SHA-256 certificate fingerprint**. Send it to Claude: it goes into `src/config/android-app.ts` next to the upload key's. Once it's live, the app opens without Chrome's address bar.
6. After the 14 days, **apply for production**, then roll out.

## Updating the app

Most changes need no app update: the app is the website. Only change `android/` for the app shell, and raise `versionCode` in `android/version.properties` for each upload.
