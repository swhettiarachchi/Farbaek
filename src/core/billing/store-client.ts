/**
 * Farbaek for Android is the website in a Trusted Web Activity (ADR 0099).
 * Google Play's Payments policy lets an app sell digital plans only through
 * Google Play's billing, and an app may not point people to another way to
 * pay. So inside the Android app the website sells nothing: plans and usage
 * top-ups are bought outside it, and the app says plainly that they can't be
 * bought there (ADR 0150).
 *
 * Chrome opens the app's pages with the app as the referrer
 * (android-app://com.farbaek.app), and the app's launch address carries
 * ?client=android-app. The tab remembers it in sessionStorage, which a TWA
 * doesn't share with the person's other Chrome tabs (cookies it would share,
 * which is why this isn't a cookie).
 *
 * This hides buttons to follow a store's rules. It isn't a security boundary:
 * nothing is charged without the person completing a checkout.
 */

export const ANDROID_APP_PACKAGE = "com.farbaek.app";

/** The query the app's launch address carries (launch_url in android/app/src/main/res/values/strings.xml). */
export const ANDROID_APP_CLIENT = "android-app";

/**
 * What the iPhone app adds when it opens a page in its in-app browser (ADR 0177). App Store rules ask the same as Google
 * Play's, so nothing can be bought from the web there either. It has no referrer to go by, so the address says.
 */
export const IOS_APP_CLIENT = "ios-app";

/** Where the tab remembers it, for later pages whose referrer is Farbaek itself. */
export const STORE_CLIENT_KEY = "farbaek-client";

/** Whether this page was opened by Farbaek for Android: its referrer or its launch address says so. */
export function isAndroidAppLaunch(referrer: string, search: string): boolean {
  if (referrer === `android-app://${ANDROID_APP_PACKAGE}` || referrer.startsWith(`android-app://${ANDROID_APP_PACKAGE}/`)) return true;
  return new URLSearchParams(search).get("client") === ANDROID_APP_CLIENT;
}

/** Whether this tab is Farbaek for Android: remembered earlier, or opened by it now. */
export function inAndroidApp(stored: string | null, referrer: string, search: string): boolean {
  return stored === ANDROID_APP_CLIENT || isAndroidAppLaunch(referrer, search);
}

/** Whether this page was opened by the iPhone app's in-app browser. */
export function isIosAppLaunch(search: string): boolean {
  return new URLSearchParams(search).get("client") === IOS_APP_CLIENT;
}

/** Whether this tab is inside either store's app, where nothing is bought from the web. */
export function inStoreApp(stored: string | null, referrer: string, search: string): boolean {
  return stored === IOS_APP_CLIENT || isIosAppLaunch(search) || inAndroidApp(stored, referrer, search);
}

/** The attribute the early mark sets on <html>, which CSS uses to hide web purchase controls (globals.css). */
export const ANDROID_APP_MARK = "data-client";

/**
 * The same question as inAndroidApp, as a script that runs inline before the page paints (ADR 0171). React
 * can only answer after hydration, so without this the app would show prices until then. It reads no data
 * of its own and takes no input from the page: it's built only from the constants above.
 */
export function earlyMarkScript(): string {
  const client = JSON.stringify(ANDROID_APP_CLIENT);
  const ios = JSON.stringify(IOS_APP_CLIENT);
  const app = JSON.stringify(`android-app://${ANDROID_APP_PACKAGE}`);
  const mark = JSON.stringify(ANDROID_APP_MARK);
  return `(function(){try{var s=null;try{s=sessionStorage.getItem(${JSON.stringify(STORE_CLIENT_KEY)})}catch(e){}var r=document.referrer,c=new URLSearchParams(location.search).get("client");if(s===${client}||r===${app}||r.indexOf(${app}+"/")===0||c===${client})document.documentElement.setAttribute(${mark},${client});else if(s===${ios}||c===${ios})document.documentElement.setAttribute(${mark},${ios})}catch(e){}})();`;
}

/**
 * The first iPhone build that sells plans: 1.1.0 (40), sent to Apple with the five subscriptions (ADR 0186). 1.0.0 (22)
 * went to Apple without them, so it never offers them, even once they're approved.
 */
export const APPLE_PURCHASES_FROM_BUILD = 40;

/**
 * The iPhone app's build number. Builds after 40 say it in X-Farbaek-App ("1.1.0+41"); 40 and older only in the
 * User-Agent iOS gives them ("Farbaek/40 CFNetwork/1568.100.1 Darwin/24.0.0").
 */
export function iosAppBuild(userAgent: string | null | undefined, appHeader?: string | null): number | null {
  const own = /^\d{1,3}(?:\.\d{1,3}){1,2}\+(\d{1,7})$/.exec((appHeader ?? "").trim());
  if (own) return Number(own[1]);
  const m = /^Farbaek\/(\d{1,7})(?:\.[\d.]*)?\s+CFNetwork\//.exec(userAgent ?? "");
  return m ? Number(m[1]) : null;
}

/**
 * Builds of Farbaek for Android from 5 say which build they are in the launch address
 * (android_build, from versionCode in android/app/build.gradle.kts), so the site offers
 * only what that build has. Older builds say nothing, and read as null.
 */
export const ANDROID_BUILD_PARAM = "android_build";
export const ANDROID_BUILD_KEY = "farbaek-android-build";

export function androidAppBuild(stored: string | null, search: string): number | null {
  const fromAddress = new URLSearchParams(search).get(ANDROID_BUILD_PARAM);
  for (const raw of [fromAddress, stored]) {
    if (raw && /^\d{1,7}$/.test(raw)) return Number(raw);
  }
  return null;
}
