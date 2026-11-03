# ADR 0155: Google Analytics on the public pages, only with consent

- Status: accepted (2026-11-03). Changes the Privacy Policy's promise of "no analytics" (ADR 0066 keeps the legal facts in one place).
- Asked for by the owner: set up Google Analytics for farbaek.com, right after Google Search Console.

## Context

Until now Farbaek set only the cookies it needs to work, and the Privacy Policy said so: no cookie banner, no analytics, no advertising, no tracking across sites. The owner wants to know which public pages bring people in and help them, and asked for Google Analytics.

Google Analytics sets cookies (`_ga`, `_ga_<id>`) and sends visit data to Google. In the EU and UK (ePrivacy rules and the GDPR), cookies that aren't needed for the service need the visitor's consent first. The App Store and Google Play privacy answers say the apps don't collect usage data, and Farbaek for Android is the website in a Trusted Web Activity.

## Decision

- **Where:** the public pages only (`src/app/(site)`, through its layout). Never in the signed-in app, Office Space, published sites or Farbaek for Android, so the stores' privacy answers stay true.
- **Consent first:** nothing from Google loads until the visitor chooses **Accept**. **Decline** sits beside it, the same size. The question is one slim bar at the bottom of the page ("We use analytics cookies to see which pages are useful. Nothing is collected unless you accept.", with Learn more), at the owner's request instead of a larger card; the bar doesn't name Google Analytics, and the Privacy Policy it links to does. The choice is kept in this browser's local storage for a year, then the question comes back. **Cookie choices** in the footer brings it back any time; choosing Decline turns the tag off on that page and deletes the `_ga` cookies.
- **Page views come from Farbaek, not Google:** Google's own page views are off (`send_page_view: false`, and history-based page views off in the stream), and the site sends one per public page with the path only. Query strings never go, and private paths (the robots.txt list: invite links carry a token in the path) send nothing. Leaving the public site turns the tag off.
- **Advertising off:** Google signals off, ad personalization signals off, and Consent Mode's ad storage, ad user data and ad personalization denied. In the Analytics account, the four optional "share data with Google" settings are off, data retention is 14 months, and the property is `Farbaek website` (Sri Lanka time, US dollars).
- **The measurement ID** lives in `src/config/analytics.ts`. It isn't a secret: every page that loads the tag shows it. While it's null, nothing shows and nothing loads.
- **The public pages' security headers** already allow third-party scripts (the strict nonce policy of ADR 0107 covers only `/app` and `/admin`), so nothing is loosened.
- **The Privacy Policy** says what's collected, why (consent), for how long, and names Google Analytics among the processors.

## Consequences

- People in the EU and UK see one question on their first visit; others see it too, since one rule for everyone is simpler and fairer.
- Reports undercount: visitors who don't allow it aren't counted at all (no cookieless pings).
- Adding analytics anywhere else (the app, the phone apps) needs a new decision and new store declarations.
- Google loads about 100 KB of script after consent, after the page is interactive, so the first load (ADR 0052) is unchanged.
