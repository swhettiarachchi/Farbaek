# ADR 0177: The web tools inside the iPhone app

- Status: accepted (2026-11-06).
- Extends ADR 0173 (the iPhone app catches up, natively). Amends ADR 0110's reasoning on selling plans in the app.

## Context

The owner wants every web feature on the phones. Android has them all, since it is the website. The iPhone has native Home, Approvals, Build, Projects and You, and it linked to the rest: Test space, Desktop app, Move projects, Workflows, Rules, Problems and pause, History, Connections, Who can do what and Settings.

Those links opened the default browser, where the person usually had to sign in again. That's a real gap for someone who only has a phone.

The research (`reports/Hybrid iOS rules and premium UX.md`) warns against authenticated web views without asking Apple first, and the App Review appointments are full until Nov 17-18. So the question was what can be done well today, within the rules.

## Decision

**Open those pages in the system's in-app browser, already signed in.**
- The app asks `POST /api/v1/app/web-link` for a page. Only someone signed in on the phone can, only for pages under `/app`, and at most 30 times a minute.
- The answer is a one-time link to `/auth/open`, which signs the browser in and goes to the page. It uses Auth's own one-time token, which works once. If it's used or too old, the person signs in as usual.
- The page opens in `SFSafariViewController`, Apple's own component for this: it stays in the app, shows the address and keeps its sign-in apart from the app. It isn't a custom web view, so it doesn't depend on the consultation.
- If the link can't be made, the page still opens, and the person signs in there.

**Nothing can be bought from those pages.** App Store rules ask what Google Play's do. The address carries `client=ios-app`, which the tab remembers, and every purchase control is hidden from the first paint, as on Android (ADR 0150, ADR 0171).

**Plans are sold in the app, from the next version.** The research's recommendation: the more of a paid product the app shows, the more guideline 3.1.3(b) applies, and it asks for in-app purchase. It's already built (ADR 0112). A free test purchase only counts for workspaces named in `BILLING_TEST_WORKSPACES` (ADR 0175).

## What's left

- **The consultation:** requests for Nov 17-18 open on Nov 8 at 1:30 PM Sri Lanka time. The request is in `docs/mobile/ios.md`. A real custom web view, without the in-app browser's address bar, waits for that.
- **Previewing a site** still can't run in the native app, since a generated site can't run there (guideline 2.5.2). It opens in the in-app browser with the rest.
