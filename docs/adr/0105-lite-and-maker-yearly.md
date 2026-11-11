# ADR 0105: Lite and Maker, billed yearly

- Status: accepted (2026-10-29). Lite's price amended by ADR 0185: $1 a month, or $12 a year, from 2026-11-11.
- Builds on ADR 0100 (payments), ADR 0102 (top-ups), ADR 0103 (the 57% margin) and ADR 0104 (going live).

## Context

The owner asked for two plans at $0.99 and $1.99 a month, below Starter ($9.99), to turn Free users into paying ones. The owner's standing rule is a 57% net margin after every fee (ADR 0103).

Dodo Payments takes 4% + 40 cents per payment, and 9% + 40 cents at worst:
- **$0.99 a month:** the fee alone takes 45% to 49% of each charge, so 57% is impossible at any cost.
- **$1.99 a month:** the fee leaves 28 cents a month for everything.

On 2026-10-29 the owner chose to bill both plans yearly, keeping 57%. The other options were to charge monthly with Lite below 57%, or to offer only Maker.

## Decision

**The two plans:**
- **Lite:** $0.99 a month, charged $11.88 a year.
- **Maker:** $1.99 a month, charged $23.88 a year.
- Dodo's fee is paid once a year (`chargeCents`, interval `year`).
- Unused AI usage still resets and carries over month by month, from the subscription's start (`wallet.ts`).

**What they pay for.** Each plan pays for what it adds on top of Free, plus its own running cost:
- Free's allowance stays a cost Farbaek gives everyone. A Free user who moves to Lite costs that much either way.
- The running cost is `ECONOMICS.lightMarginalUsd`, 5 cents a month: site storage, backups and email.
- They don't carry the 40-cent share of the server's fixed costs (`fixedShareUsd`), which the monthly plans already pay.
- So 57% of the yearly charge, after the worst-case fee, covers twelve months of what the plan adds (`lightAllowance`).

| | Free | Lite | Maker | Starter |
| --- | --- | --- | --- | --- |
| AI usage a month | 5,000 units | 7,532 (1.5x Free) | 9,220 (1.8x Free), plus 222 for failed attempts | 16,070 |
| Sandbox hours | 1 | 1 | 2 | 5 |
| Projects | 1 | 2 | 3 | 3 |
| History | 7 days | 30 days | 30 days | 30 days |
| Policy evaluations | 1,000 | 2,000 | 3,000 | 5,000 |
| Adds | | usage alerts, developer API, unused usage carries over | failed attempts given back | more of everything |

Sandboxes on Lite and Maker stay on the small size, one at a time.

**Features build up plan by plan:** Lite has everything in Free, Maker everything in Lite, and Starter everything in Maker. Unused usage carrying over costs nothing over a year, so Lite has it too. Paid grants already roll over for every paid plan.

**Top-ups:**
- Lite and Maker buy at Starter's rate, not their own. Their own rate includes Free's allowance, so a $10 pack would buy about $7.50 of AI usage.
- At Starter's rate a pack keeps more than 57%.
- The share shown is still of the person's own plan; for example, a $10 pack is about 214% of a month of Lite.

**Plan changes:**
- Lite and Maker sit between Free and Starter in `PLAN_ORDER`.
- **Up from a yearly plan to a monthly one** uses Dodo's `prorated_immediately`: the unused part of the year comes off the new plan's price, and anything left over goes toward later renewals.
- **If Dodo refuses that move** (it documents a refusal for its keep-cycle mode), Billing says nothing was charged and gives the support address (`YEARLY_SWITCH`).
- **Down to Lite or Maker** happens at the next billing date, as before.

**The renewal reminder:**
- Some US states require a notice before a yearly renewal; California's window is 15 to 45 days ahead.
- An hourly job (`renewal-reminders.ts`) emails the workspace's owners and admins once per renewal date, 30 to 16 days ahead, unless a cancellation is scheduled.
- It always goes out. A failed send is tried again on the next run.
- Migration v66 keeps one row per renewal date.

**Products:** `billing_products` records each product's interval, and Office Space creates Lite and Maker as yearly products and checks the interval at Dodo. The catalog version is unchanged, so **Create live products** adds only the two new ones.

**The Terms:** the Paid plans section, version `2026-10-29`, covers:
- yearly renewal with the reminder;
- the yearly-to-monthly change;
- top-ups at Starter's rate.

The owner approved this text with the plan for this stage.

## Amendment (2026-10-29): monthly too

The owner then asked that people may pay Lite and Maker monthly as well: "if user want pay monthly, its okay".

**Separate plans.** The monthly versions are plans of their own, `lite_monthly` and `maker_monthly`, named "Lite monthly" and "Maker monthly":
- each has its own monthly product;
- checkout, plan changes, entitlements and the webhook mapping work unchanged;
- migration v67 adds them to the plan checks.

**Where they show up:**
- the cards and Billing show them on their yearly plan's card, as "Pay monthly instead";
- the comparison lists them as columns of their own, because their usage differs;
- upgrade hints skip them.

**What a monthly charge pays for.** It pays Dodo's 40-cent fee every month, so it pays for less:
- **Maker monthly** ($1.99) keeps 57%, with the same 2 sandbox hours and about 1.15x Free's AI usage (5,737 units, 38 for retries).
- **Lite monthly** ($0.99) can't reach 57% at any cost. It has Free's AI usage plus what costs nothing (2 projects, 30-day history, alerts, API, rollover, top-ups). That's the most a 99-cent charge can keep: about 45.5% at the worst-case fee, and about 50% for a US card. The owner accepted this.
- **Everything except AI usage** is the same as paying yearly. Paying yearly is how people get more AI usage.

**Unchanged:**
- top-ups for both monthly plans use Starter's rate;
- the renewal reminder stays yearly only.

## Amendment (2026-10-29): monthly first

The owner asked that Lite and Maker be shown as monthly plans: low-cost plans where people try Farbaek, then upgrade.

**Plan ids and products are unchanged.** `lite_monthly` and `maker_monthly` are now the plans on the cards, named "Lite" and "Maker". `lite` and `maker` are their yearly versions, "Lite yearly" and "Maker yearly", offered as "Pay yearly instead" with how much more AI usage they include (about 51% and 61%).

**Elsewhere:**
- Upgrade hints and the comparison's defaults point at the monthly plans.
- Billing shows "Current, yearly" for a yearly subscriber.
- The renewal reminder, top-ups and margins are as above.

## Consequences

- The pricing page's first row is Free, Lite, Maker and Starter. The cards' buttons now go to sign-in, and on to Billing for a paid plan, replacing "Sign-up opens at launch".
- The margin test checks each yearly plan against 57% of its yearly charge at the worst-case fee (`catalog.test.ts`).
- If the server's fixed costs grow with these plans, `lightMarginalUsd` is where to raise the cost.
