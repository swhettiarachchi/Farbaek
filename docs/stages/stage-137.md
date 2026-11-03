# Stage 137: Google Analytics on the public pages, with consent

- **Branch:** `feat/google-analytics`.
- **Migration:** none.
- **ADR:** 0155.

## 2026-11-03

### Asked

After Search Console (stage 136), the owner asked to set up Google Analytics.

### Done

- **The Analytics account** (the Farbaek Google account): account `Farbaek` with the four optional data-sharing settings off; property `Farbaek website`, Sri Lanka time, US dollars; industry Computers & Electronics, small business; objectives: understand web traffic, and engagement and retention. The owner accepted Google's terms and the GDPR Data Processing Terms (auto mode refuses that click). Then: the web stream for https://www.farbaek.com, measurement ID `G-G0BERESXRT` (read character by character: the fourth is a zero); enhanced measurement without history-based page views, site search or form interactions; event and user data kept 14 months; Google signals and user-provided data off; Google's optional marketing emails off.
- **`src/core/analytics/consent.ts`** (pure, tested): the stored choice and its one-year life, a valid measurement ID, Google Analytics' cookie names, and when to ask or load.
- **`src/components/analytics/analytics-consent.tsx`:**
  - the question, a card at the bottom of public pages: "Can we count your visit?", with "Don't allow" and "Allow" side by side and the same size, and a link to the Privacy Policy;
  - Google's tag only after Allow, with advertising features off and Google's own page views off;
  - Farbaek sends one page view per public page: the path only, never a query string, and never for a private path (`isPrivatePath`, the same list robots.txt uses), so an invite link's token never reaches Google. Leaving the public site turns the tag off;
  - "Don't allow" later turns the tag off and deletes the `_ga` cookies;
  - "Cookie choices" in the footer's legal links brings the question back;
  - never in Farbaek for Android, and never while the measurement ID is unset.
- **Only on the public site:** added to `src/app/(site)/layout.tsx`. The signed-in app, Office Space and published sites don't load it.
- **The Privacy Policy** (updated 3 November 2026): what's collected and only with consent, why, 14 months' retention, the `_ga` cookies and the stored choice, and Google Analytics among the processors.
- **ADR 0155.**

### Verified

- `vitest` on `src/core/analytics`, `src/core/seo`, `src/config` and `tests/design`; `pnpm typecheck`; ESLint on the changed files.
- **A production build in headless Chrome,** with every request to Google aborted so no test visit reached the real property:
  - a first visit at 375px: the question shows, its two buttons 44px tall, **0 requests to Google and 0 `_ga` cookies**, no sideways scroll, no console errors;
  - after Allow: one request for `gtag/js?id=G-G0BERESXRT`; consent default with ad storage, ad user data and ad personalization denied; config with `send_page_view: false` and signals off; one page view for `/pricing`;
  - `/security?ref=abc&token=secret` sent as `/security`, without its query;
  - Cookie choices brought the question back with "Right now: allowed"; Don't allow set `ga-disable-G-G0BERESXRT` and stored the choice;
  - an invite link with analytics allowed: 0 page views, the tag turned off;
  - opened the way Farbaek for Android opens it (`?client=android-app`, then a later page): no question, no Cookie choices, 0 requests to Google. A referrer-only check can't be made headless: Chrome drops `android-app://` referrers.
  - desktop at 1280px: the card at the bottom left.

### Next

- After the merge: open www.farbaek.com, choose Allow, and check Realtime in Google Analytics shows the visit.
- Link Search Console to Analytics (Admin, Product links) if the owner wants search queries beside visits.
