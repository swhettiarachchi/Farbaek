# ADR 0150: Nothing is sold inside Farbaek for Android

- Status: accepted (2026-11-01).
- Follows ADR 0099 (Farbaek for Android is the website in a Trusted Web Activity), which didn't consider Google Play's Payments policy.

## Context

Farbaek for Android opens www.farbaek.com/app full screen. The website sells plans and AI usage top-ups through Dodo Payments.

Google Play's Payments policy:
- An app on Google Play that sells digital services, such as a plan or more AI usage, must sell them through Google Play's billing.
- Inside the app, it may not lead people to another way to pay: no buttons, links or messages that send them to a checkout elsewhere.

Selling through Google Play's billing from a TWA is possible (the Digital Goods API), but it needs:
- a service account on the owner's Play account;
- server checks of each purchase;
- prices set for Google's fee.

That's a separate piece of work, like ADR 0112 was for the App Store.

## Decision

**Inside the Android app, the website sells nothing and says so plainly.**

**Knowing it's the app.**
- Chrome opens the app's pages with `android-app://com.farbaek.app` as the referrer.
- The app's launch address is now `https://www.farbaek.com/app?client=android-app`.
- The tab remembers either one in `sessionStorage` (`src/core/billing/store-client.ts`, and `AndroidAppMarker` in the root layout).
- **Not a cookie:** a TWA shares Chrome's cookies, so a cookie would also stop the person buying in their ordinary Chrome tabs. Session storage belongs to the app's own tab.

**What changes there** (`WebPurchaseOnly`, `src/components/billing/web-purchase-only.tsx`):
- **Billing:**
  - each plan's Choose, Upgrade and Switch become a pill: "Can't be bought in the Android app";
  - so do the usage top-up packs;
  - Keep (resume) a cancelled plan becomes "Can't be renewed in the Android app";
  - the payment-method portal button is left out;
  - a choose, switch or top-up step reached by its address shows "Plans and AI usage can't be bought in the Android app";
  - the line about paying at checkout is left out.
- **Pricing:** paid plans' Choose and yearly options become the same pill. Start free stays: the trial is free and needs no payment.
- **Nothing points elsewhere.** The words never say where else to buy, as the policy asks.

**What doesn't change:**
- Cancelling a plan still works in the app.
- Usage, limits and the current plan are all shown.
- Links to Billing stay, because the page still shows the plan and usage.

**Not a security boundary.** This hides buttons to follow a store's rules. Nothing is ever charged without the person finishing a checkout. Before the page loads its scripts, it can't know it's in the app, so for that moment it looks like the website.

## Consequences

- The Android app can go on Google Play without breaking the Payments policy, and the website is unchanged everywhere else.
- **People who use the app buy plans outside it,** and the app doesn't say where. Selling through Google Play's billing would fix that. It's left for a later decision: see Context for what it needs.
- The Play listing doesn't mention prices or buying.

## Update, 2026-11-02: one notice instead of a pill on every card

The owner compared the two apps. The iPhone app shows the plan and says nothing more outside the United States; the Android app repeated "Can't be bought in the Android app" on every plan and top-up pack. They chose to keep selling nothing in the Android app and asked for it to look clean and professional. Their options were:
- Google Play's billing;
- a website link, which Google allows only for US users through its External Content Links program, with enrolment and a fee.

**What changed in the app:**
- **Billing's Plans:**
  - one notice ("Plans aren't sold in the Android app": the plan, usage and renewal date are all here);
  - then what each plan includes, in one list, with the workspace's plan marked;
  - no prices and no buttons (`src/components/billing/android-plans.tsx`).
- **Top-ups:** the card is left out.
- **The invoices line** reads "No invoices." instead of mentioning a checkout.
- **The pricing page** shows the same notice once, above the plans, instead of a pill on each card.

The website is unchanged everywhere else. Nothing in the app names another way to pay.
