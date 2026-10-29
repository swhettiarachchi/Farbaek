# Stage 81: Lite and Maker, billed yearly

The owner asked for $0.99 and $1.99 plans with the 57% margin kept. Dodo's 40-cent fee makes that impossible on a monthly 99-cent charge, so on 2026-10-29 the owner chose yearly billing: $11.88 and $23.88 a year.

- **Decision record:** `docs/adr/0105-lite-and-maker-yearly.md`.
- **Branch:** `feat/light-plans`.

## 2026-10-29

### Done

- **Catalog:**
  - `lite` and `maker`, with `interval: "year"`;
  - `lightAllowance` (Free plus what 57% of the yearly charge pays for, after a 5-cent running cost);
  - `chargeCents`, `chargeLine`, `priceWords`, `isYearly` and `YEARLY_PLAN_IDS`;
  - features that build up (Lite: alerts, API, rollover; Maker: failed attempts given back);
  - small sandboxes only.
- **Payments:**
  - Dodo products with a yearly interval, and the interval read back for the office's check;
  - checkout and plan changes compare against the yearly charge;
  - the consent says "a year";
  - a refused yearly-to-monthly change explains itself (`YEARLY_SWITCH`);
  - top-ups at Starter's rate.
- **Renewal reminder:** an hourly job emails owners and admins 30 to 16 days before a yearly renewal, once per date. A failed send is tried again.
- **Migration v66** (`20261207090000_light_plans.sql`):
  - the plan checks take the two plans;
  - the product interval check takes `year`;
  - `app_staff_record_billing_product` gains `p_interval`;
  - `billing_renewal_reminders` and three server-only functions.
- **UI:**
  - the pricing cards show "Billed $11.88 a year" and say "Everything in Maker, with more usage" where no feature is new;
  - the cards' buttons go to sign-in and on to Billing, replacing "Sign-up opens at launch";
  - the comparison table has a "Charged" row;
  - the teaser is 5 across;
  - the Billing plan list and choose step show the yearly charge, with the reminder promise;
  - plan-change sentences use the yearly price.
- **Terms:** version 2026-10-29: yearly renewal and the reminder, the yearly-to-monthly change, and top-ups at Starter's rate.

### Verified

- **Unit:**
  - each yearly plan keeps 57% of its yearly charge at the worst-case fee;
  - a monthly 99-cent charge can't;
  - features build up;
  - Lite and Maker top-ups match Starter's units;
  - "a year" in the consent;
  - yearly products sent as `"Year"` and read back;
  - checkout at $11.88, a monthly-priced product refused;
  - a refused yearly-to-monthly change gives `YEARLY_SWITCH`;
  - a downgrade to Lite is scheduled;
  - the reminder: content, once per date, no address, a retry after a failure.
- **PGlite** (`tests/db/light-plans.test.ts`, 4):
  - browsers refused;
  - the plans and a yearly product accepted, with an unknown interval refused;
  - candidates only on yearly plans still renewing in 16 to 30 days;
  - a claim made once, a failed one taken back, and the result recorded.

- **Production build in the browser:**
  - `/pricing` at 1280px: the first row is Free, Lite, Maker, Starter, with "Billed $11.88 a year", and the buttons go to sign-in, then to Billing for a paid plan;
  - at 375px: no sideways scroll, every plan button is 44px or taller, and the comparison table scrolls inside its own frame;
  - the home teaser and FAQ read correctly.
- **Full suite:** 2,012 tests; typecheck and lint clean.
- **Also fixed:** the pricing page still said "Payments aren't open yet". It now says how Lite, Maker and the monthly plans are charged.

- **Migration v66 applied in production** (2026-10-29), before the code. The SHA-256 (`1ea4f470…4fc5c3`) was checked on the server, and it ran in one transaction. Read back:
  - the plan checks list `lite` and `maker`, and the interval check allows `year`;
  - `billing_renewal_reminders` has row security on, with 0 rows;
  - the three reminder functions and the new `app_staff_record_billing_product` are server-key only;
  - the 14 existing products are all monthly and unchanged;
  - the API's schema cache was reloaded.

### Monthly too (the owner's request, 2026-10-29)

- **Plans:** `lite_monthly` and `maker_monthly` (ADR 0105 amendment). Maker monthly keeps 57%; Lite monthly has Free's AI usage, about 45.5% at the worst-case fee, which the owner accepted.
- **Migration v67** (`20261208090000_light_monthly.sql`) adds them to the plan checks.
- **UI:**
  - the cards have "Choose Lite yearly" and "Pay monthly instead", with what changes;
  - Billing has a second button on the Lite and Maker cards, and "Current, monthly";
  - the comparison has both monthly columns;
  - Office Space creates their products.
- **Tests:**
  - Maker monthly keeps 57%;
  - Lite monthly adds no AI and sits at about 45.5%;
  - each monthly plan matches its yearly plan except for AI usage;
  - top-ups at Starter's rate;
  - hints skip the monthly plans;
  - PGlite accepts `maker_monthly` and leaves it out of yearly reminders.

- **Migration v67 applied in production** (2026-10-29), before the code. The SHA-256 (`07457024…d108c7`) was checked on the server, and it ran in one transaction. Read back: all three plan checks list `lite_monthly` and `maker_monthly`, no account is on a light plan yet, and the schema cache was reloaded.

### The comparison on phones (the owner's report, 2026-10-29)

**The fault:** on a phone, the comparison table's pinned label column was 336 of 341 pixels wide, so none of the plans could be seen. It had been 365 pixels before this stage.

**The fix:**
- **Phones:** pick two plans to compare (`compare-plans.tsx`). Choosing the plan already in the other box swaps them. Each section heads its two columns with the plans' names.
- **Tablet and desktop:** the label column is 208 to 240 pixels, each plan column shows its price under its name, and a line says the tables scroll sideways.

**Catching it next time:** `pnpm qa:responsive` now reports "crowded scroll frames", where a pinned column takes more than half its frame.
- Run against the live site, it flagged all four tables at 375px.
- On this build: 0 at 320 to 1440px.
- The full audit beforehand: 210 page views with no sideways scroll, cut-off content, small targets or errors.

### Not verified yet

- **A real yearly-to-monthly change at Dodo:** the preview runs first and nobody is charged if Dodo refuses.
- **A real $11.88 checkout:** the owner's call.
