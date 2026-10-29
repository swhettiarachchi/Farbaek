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

### Not verified yet

- **A real yearly-to-monthly change at Dodo:** the preview runs first and nobody is charged if Dodo refuses.
- **A real $11.88 checkout:** the owner's call.
