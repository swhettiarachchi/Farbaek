# ADR 0197: One way to subscribe

- **Status:** accepted
- **Date:** 2026-11-14
- **Stage:** 189
- **Builds on:**
  - ADR 0150 (store apps sell nothing from the web);
  - ADR 0105 (Lite and Maker, monthly or yearly);
  - ADR 0177 (both store apps hide web purchases).

## Context

The owner found that clicking a plan on the home page did nothing, and asked for plans that lead to the cart or checkout, with a clear Subscribe button.

What was really there:
- **The home page's grid** had no links at all.
- **The /pricing cards** lifted on hover, as if clickable, but only their Choose button did anything. It went to `/sign-in?next=/app/billing?choose=<plan>`.
- **Someone new** has no workspace yet. After signing in they landed on "What do you want to build?", and their plan choice was lost.
- **Someone already paying** who chose another plan saw Billing with nothing open, because `choose` was ignored once there was a subscription. A member who isn't an owner or admin saw the same.

**The cart already existed:** Billing's review step. It shows the plan, its price, what's included and the consent box, then **Continue to secure checkout** opens Dodo Payments.

The consent box records agreement to:
- renewal until cancelled;
- the currency fee;
- tax;
- the trial ending.

So a click mustn't skip it and jump straight to payment.

## Decision

**One address for every Subscribe button: `/subscribe/<plan>`.** The page works out where the visitor stands, on the server:
- **A plan that isn't paid and self-serve** goes to /pricing.
- **Signed out:** sign in with `next=/subscribe/<plan>`, then back here. The session is checked before the app context, which would forget the plan.
- **No workspace yet:** name one ("My workspace" to start), then one press, **Continue to review**, makes it and goes on.
- **With a workspace,** and in the demo: Billing's review step, `/app/billing?choose=<plan>#billing-step`.

**Billing answers every chosen plan** (`subscribeStep` in `src/core/billing/subscribe.ts`, tested). It gives:
- **The review step** for a workspace that doesn't pay yet.
- **The change step** for someone paying through Dodo Payments, with its proration preview.
- **A notice for the plan they already have.**
- **A notice for a plan billed through a store**, naming where it changes.
- **A notice for members** other than owners and admins, with a link to subscribe a workspace of their own (`/subscribe/<plan>?new=1`).
- **A plan set to end:** a notice to keep it first. The server also refuses a plan change while a plan is set to end (`CANCELLING`), so the rule doesn't depend on a hidden button.
- **When nothing can be saved** (a paused workspace): the real reason, never "ask an owner".
- **When checkout isn't open,** the existing notice.

**The review step reads as a cart:**
- the title is "Subscribe to <plan>";
- it names the workspace being subscribed;
- Lite and Maker get a Monthly and Yearly switch.

**Plan cards are one link each.**
- **The link:** the pill (Subscribe, or Start free on Free) is the card's only link. Its hit area stretches over the whole card, so a click anywhere goes there.
- **Keyboard and screen readers:** a keyboard stops once per card, and a screen reader hears "Subscribe to Pro".
- **The pill** follows the card's hover and press.
- **On /pricing,** Pay yearly instead and its note sit above the stretched area, so they stay their own targets.

**The plan stays in view.** Sign-in and the workspace step show the plan's price, what's included and the four steps (sign in, name your workspace, review and agree, pay on Dodo Payments), with where the person is.

**Store apps:**
- **The home page's** Subscribe buttons carry `data-web-purchase`, so the Android and iPhone apps hide them from the first paint and their paid cards aren't links.
- **/pricing** keeps `WebPurchaseOnly`.

**The proxy** refreshes the session on `/subscribe` as it does on the app's pages.

## Consequences

- **Nobody reaches checkout without the review step and its consent,** and nobody loses their choice on the way.
- **A new workspace may start the trial,** and subscribing then ends it. The consent box already says "Billing starts today, and your remaining trial days end now".
- **Links from elsewhere** (emails, films, posts) can use `/subscribe/<plan>` and work for anyone.
- **Not covered:** the Android and iPhone apps still sell through their stores (ADR 0154, ADR 0186), unchanged.
