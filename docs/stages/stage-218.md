# Stage 218, part 1: the suggested prices, worked out in code

- **Date:** 2026-11-22
- **Branch:** `feat/stage-218-price-model`, from `main`
- **Decision:** ADR 0231
- **Migration:** none. **New dependency:** none. **Nothing live changes.**

## What the owner asked

New monthly prices of $3.99, $20, $50, $100 and $200 with a custom plan, a 57% blended contribution margin, a real financial model behind any claim, and no live billing change without their yes.

## What was built

- **`src/core/billing/suggested-prices.ts`:** the five prices through the formula today's plans use (`allowance.ts`). For each: the payment fee, the AI usage it pays for, and both margins at full use. Also a guide to what the usage buys, the smallest plan billed yearly, and scenarios for a stated mix and use.
- **`docs/farbaek/FARBAEK_SUBSCRIPTION_ECONOMICS.md`:** the page to decide from, written from the code.

## What it found

| Plan | Price | AI usage a month | Contribution margin at full use |
| --- | --- | --- | --- |
| Starter | $3.99 | $0.40 | 67.0% |
| Plus | $20 | $5.54 | 59.0% |
| Pro | $50 | $14.55 | 57.8% |
| Business | $100 | $29.32 | 57.4% |
| Scale | $200 | $58.10 | 57.2% |

- Net margin is 57.0% for each at full use, by construction.
- $3.99 monthly pays for about 940 sample chat turns on the fast model, or about 47 on a standard one. Billed yearly it leaves about $0.76 a month for AI instead of $0.40.

## Verified

- `suggested-prices.test.ts`, 17 tests:
  - the five anchors, in order;
  - each plan keeps 57% net and more in contribution at full use;
  - each step up includes more;
  - the formula refuses test space a price can't pay for;
  - the $3.99 numbers, monthly and yearly;
  - cost falls with use and never below the fee and storage;
  - scenarios add up, keep one margin at any size, and stay above 57% for extreme mixes;
  - a mix that doesn't add up is refused;
  - the page equals what the code writes.
- `pnpm typecheck` and lint on `src/core/billing`: clean.
- The billing tests and the plain-words test: 161 pass. The first draft called these a "proposal", which the plain-words rule refuses; they are "suggested prices" throughout.

## Not done, and whose step it is

- **The owner decides** the prices, whether Starter is monthly, yearly or both, the hours and seats, and what each plan includes.
- The catalog, entitlements and the prices in Dodo, the App Store and Google Play follow that decision.
- The mix and the 60% use are assumptions; there are no measurements for plans that aren't sold.
- The app stores' cut, top-ups, and separate limits for images, video and voice are not modelled yet.
