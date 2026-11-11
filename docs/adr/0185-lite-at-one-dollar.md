# ADR 0185: Lite at one dollar, and products found by price

- **Status:** accepted
- **Date:** 2026-11-11
- **Stage:** 174
- **Amends:** ADR 0105 (Lite and Maker) for Lite's price, and ADR 0100 (payments) for how checkout finds a plan's product.

## Context

The owner asked to change the $0.99 plan to $1.00. That plan is Lite: $0.99 a month on the cards, or $11.88 a year paid yearly.

Checkout charges a Dodo Payments product. Until now, the products were looked up by the catalog version they were made for (`PLAN_CATALOG_VERSION`), one per plan and version. A product's price at Dodo can't simply change, and the database records one product per plan and version. So a new price needed a new version. That caused two problems:
- A new version left every plan and top-up without a product until an owner made new ones in Office Space, so all checkout would have paused, not just Lite's.
- The same constant is stamped on every new workspace's billing account by SQL, so changing it needed a migration.

## Decision

**Lite is $1 a month, or $12 a year paid yearly.**
- Prices read "$1 a month" and "Billed $12 a year", like Pro's "$50": whole dollars have no cents. The checkout consent reads "$12.00 USD a year".
- Monthly Lite still has Free's AI usage. A dollar can't keep 57% at the worst-case fee, so it keeps about 46%, up from 45.5%.
- Yearly Lite includes 7,566 AI units a month, up from 7,532. That's still about 51% more than monthly.

**A plan's product is the newest one recorded, in the server's mode, at the plan's current price** (`src/core/billing/products.ts`). Which price list made it no longer matters.
- **Checkout and plan changes** use that product. A plan whose price changed has none until new products are made, so checkout says "This plan isn't set up for checkout yet" and nobody is charged the old price. Every other plan keeps selling.
- **Products have their own price list,** `PRICE_LIST_VERSION` in `src/core/billing/products.ts`, now `2026-11-11.1`. `PLAN_CATALOG_VERSION` stays `2026-10-18.1` and is only the stamp on new billing accounts, so no migration was needed. A test pins the price list to every price, so changing a price fails until the price list changes too.
- **Create products** in Office Space only makes products for plans with none at their current price, and for top-up packs with none at all. It records them against the current price list. If a plan already has a product in that price list at another price, it refuses before calling Dodo. So a price change is three steps:
  1. Change the price.
  2. Change `PRICE_LIST_VERSION`.
  3. Press Create products after the deploy.
- **Top-up packs** use their newest product, whatever price list made it. A pack's amount is its price.
- **A product id still names one plan for good,** so renewals and webhooks for older products keep working.
- **Never archive an old product at Dodo** while anyone is subscribed to it. Also, if a price ever goes back to an old amount, the newest product at that amount may be an old one, so check it in Office Space's Products table before reopening checkout.

**People already on Lite keep their price.** Their subscriptions stay on the old products at Dodo, which charge $0.99 a month or $11.88 a year until they cancel or change plan.
- **The yearly renewal notice** states what the subscription renews at: the amount of the product it's on, read from Dodo and Farbaek's records. If that can't be read, or the product is for another plan because a change hasn't reached Farbaek yet, it says "at the price you pay now" rather than guess a number. The amount is read before the notice is claimed, so a slow answer can't strand it.
- **Billing's plan cards** show list prices, so a subscriber still paying $0.99 sees "$1 a month" on their current card. Dodo's receipts and customer portal show what each person pays.
- **Office Space's revenue** counts subscriptions at list price, so it counts each of these subscribers a cent a month high.

**The App Store and Google Play still sell Lite at $0.99.**
- Their prices are set in App Store Connect and Play Console, and `src/core/billing/apple.ts` and `google-play.ts` record them.
- The Android app shows the recorded US price.
- They change when the owner changes the store prices. ADR 0112 wanted them to match the web, so for now Lite costs a cent more on the web.

## Consequences

- **Lite checkout pauses** from the deploy until an owner presses Create products in Office Space (Payments). That makes the two Lite products at Dodo: $1 a month and $12 a year. Every other plan and the top-ups keep working throughout.
- **A future price change** only needs new products for the plans it changes.
- **The pricing page, Billing, checkout consent and plan changes** take the new price from the catalog, as before.
