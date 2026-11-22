# ADR 0231: The suggested prices are worked out in code before anything is sold

- **Status:** accepted (stage 218, part 1, 2026-11-22)
- **Builds on:** ADR 0020 (usage and the rate card), ADR 0103 (57% after every fee and cost), ADR 0105 (Lite and Maker)
- **Changes nothing that is live.** Today's plans, prices and allowances are untouched.

## Context

The owner's brief sets new monthly prices ($3.99, $20, $50, $100, $200, and a custom plan) and a target of a 57% blended contribution margin. It also says: don't claim 57% without a real financial model, don't promise unlimited use on a cheap plan, and get the owner's yes before any live billing change.

Farbaek already has the formula: `allowance.ts` turns a price into an allowance that keeps 57% after the payment fee, a share of fixed costs, storage and test space. What it didn't have was that formula applied to the suggested prices, written down where the owner can read it and decide.

## Decision

**A model, `src/core/billing/suggested-prices.ts`, separate from the catalog.**

- The five prices, each with a suggested number of test space hours and seats.
- For each: the payment fee, the AI usage the price pays for, and both margins when a subscriber uses everything the plan includes.
- A guide to what the AI usage buys, in sample chat turns on a fast and a standard model.
- The smallest plan billed once a year, where the provider's fixed fee is paid once.
- Scenarios from 100 to 50,000 subscribers for a stated mix and a stated share of use.

**Two margins, kept apart.** Contribution margin is the price less what one more subscriber costs. Net margin also takes the share of fixed costs. The allowance is sized so net margin is 57% at full use, so contribution margin is never below 57% for any mix and any use. A test checks this for extreme mixes.

**The page is written from the code** (`docs/farbaek/FARBAEK_SUBSCRIPTION_ECONOMICS.md`), and a test fails when they differ. No number on it is typed by hand.

**Assumptions are labelled.** The mix of plans and the share of use are assumptions; Farbaek has no measurements for plans that aren't sold. The page says so beside the numbers.

## What the model found

- **$3.99 billed monthly leaves about $0.40 a month for AI.** The provider's fee is about a fifth of the price, because 40 cents of it is fixed. That pays for everyday chat on the fast model and nothing heavier.
- **Billed once a year, it leaves about $0.76 a month,** nearly twice as much. A yearly Starter is the stronger offer.
- **From $20 up, the formula leaves real room:** about $5.50, $14.50, $29 and $58 of AI a month, beside the suggested test space.

## What it leaves out, on purpose

Salaries and marketing, the app stores' cut on plans bought inside the apps, taxes, refunds and discounts, top-ups, and separate limits for images, video and voice. Each is named on the page.

## Next, and whose step it is

1. **The owner decides** the prices, monthly or yearly for Starter, the hours and seats, and what each plan includes.
2. Only then: the catalog, the entitlements, and the prices in Dodo, the App Store and Google Play.
