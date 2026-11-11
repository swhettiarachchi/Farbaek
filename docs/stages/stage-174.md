# Stage 174: Lite at one dollar

- **Branch:** `feat/lite-price`, from `main` (a0ceca0).
- **ADR:** 0185, amending ADR 0105 and ADR 0100. No migration.

## What the owner asked

"Please change the $0.99 plan to $1.00." That plan is Lite: $0.99 a month on the cards, or $11.88 a year paid yearly.

## What changed

**The price.**
- Lite is $1 a month, or $12 a year paid yearly.
- Cards read "$1 a month" and "Billed $12 a year". Whole dollars show without cents, like Pro's "$50".
- The checkout consent reads "$12.00 USD a year".
- The pricing page description now reads "from $1 to $300 a month". It comes from the catalog.
- Monthly Lite keeps Free's AI usage. Its worst-case margin is about 46%, up from 45.5%.
- Yearly Lite includes 7,566 AI units a month, up from 7,532. That's still about 51% more than monthly.

**How checkout finds a product** (`src/core/billing/products.ts`):
- **Before:** checkout looked a product up by its catalog version, so a new price needed a new version. A new version left every plan and top-up without a product. It also needed a migration, because SQL stamps that version on new billing accounts.
- **Now:** a plan's product is the newest one recorded at its current price. Top-ups use the newest product for each pack.
- **The new price list:** products are recorded against their own price list, `PRICE_LIST_VERSION` (now `2026-11-11.1`). `PLAN_CATALOG_VERSION` stays as the account stamp.
- **A test pins the price list to every price,** so a price can't change without it.
- **Office Space's Payments page and Create products** use the same rule. Create products makes products only for plans with none at their current price. It refuses before calling Dodo if a product in the current price list would clash.

**People already on Lite keep their price.**
- Their subscriptions stay on the old Dodo products.
- The yearly renewal notice now states what the subscription renews at: the amount of the product it's on. If that can't be read, it says "at the price you pay now".

## Verified

- **Unit tests:** the price list test fails if a price changes without a new price list. Product choice is tested:
  - Lite has no product until the new ones exist;
  - other plans keep theirs whatever price list made them;
  - the newest product at the price wins;
  - another plan's product is never picked.
- **Renewal notice tests:** a subscriber who joined at $11.88 is told $11.88. If the amount can't be read, the notice shows no number.
- **Checks:** `pnpm typecheck`, `pnpm lint` and the whole `pnpm test` suite.
- **In the browser (demo dev server):**
  - `/pricing` shows Lite at "$1 a month", with "$12 a year" for paying yearly.
  - `/app/billing` lists Lite at "$1 a month".
  - No console errors.
- **An independent review** of the billing diff found nothing wrong in checkout, plan changes, top-ups or product mapping. It found two problems in the renewal notice, both fixed:
  - the notice could pair one plan's name with another plan's amount while a plan change hadn't reached Farbaek, so the amount now counts only when the product is for that plan;
  - reading the amount after claiming the notice could strand it, so it's read first.
- **Full suite:** 2,869 tests passed. The two renewal fixes came after that run, and their 213 billing and job tests pass.

## For the owner

1. **After the merge deploys, open Office Space, then Payments, and press Create products.**
   - It makes the two new Lite products at Dodo: $1 a month and $12 a year.
   - Until then, Lite checkout says it isn't set up yet. Nobody is charged, and every other plan keeps selling.
2. **The phone apps still sell Lite at $0.99.**
   - Their prices are set in App Store Connect and Play Console.
   - To match the web, change Lite to $1.00 in both.
   - Then `src/core/billing/apple.ts` and `google-play.ts` need their `usdCents` set to 100, because the Android app shows that number.

## Not done

- No real purchase was made. The first real Lite checkout after Create products is the live check.
- Billing's plan cards show list prices. A subscriber still on $0.99 sees "$1 a month" on their current card, while Dodo's receipts show what they pay.
- Office Space's revenue counts such a subscriber a cent a month high.

## Later the same day: the stores

- **Google Play:** Lite's US price is $1.00 (Play Console, the `monthly` base plan's United States row). Other countries keep their local prices. Nobody subscribes to it yet, so nobody's price changed. `google-play.ts` says 100.
- **App Store:** still $0.99. App Store Connect offers no way to change a subscription's price before its first review: the price section's menu only offers discounts. Once the five subscriptions have their review screenshot, try again there; failing that, schedule the change once Apple approves them. Then set `apple.ts` to 100 and remove the Lite exception in `google-play.test.ts`.
