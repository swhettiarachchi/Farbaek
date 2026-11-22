# Farbaek subscription economics: the suggested prices

Written from the code by `src/core/billing/suggested-prices-doc.ts`. Don't edit by hand: change `suggested-prices.ts`, then run `WRITE_DOCS=1 pnpm exec vitest run src/core/billing/suggested-prices.test.ts`.

**These are suggestions. Nothing here is sold.** Today's live plans and prices are unchanged, and they stay that way until the owner says yes: changing a live price is the owner's decision, in Dodo, the App Store and Google Play.

## The rule

Every allowance comes from one formula (`allowance.ts`, ADR 0103). From the price come, in order: the payment provider's worst-case fee (9% and $0.40 a charge), a share of fixed costs ($0.40), storage ($0.16), the plan's hours of test space ($0.15 an hour), and 57% kept. What is left is AI usage at the providers' list prices.

So the 57% is a floor, not a hope: the allowance is the cap, and a subscriber who uses all of it still leaves 57%.

- **Contribution margin** is what the brief asks for: the price, less what one more subscriber costs.
- **Net margin** also takes the share of fixed costs. It is 57% at full use, by construction.

## What each price can include

Hours of test space and seats are suggestions to decide on. The margins are at full use of everything the plan includes: the worst case.

| Plan | Price a month | Payment fee | AI usage a month | Test space hours | Seats | Contribution margin | Net margin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Starter | $3.99 | $0.76 | $0.40 | 0 | 1 | 67.0% | 57.0% |
| Plus | $20.00 | $2.20 | $5.54 | 2 | 1 | 59.0% | 57.0% |
| Pro | $50.00 | $4.90 | $14.55 | 10 | 1 | 57.8% | 57.0% |
| Business | $100.00 | $9.40 | $29.32 | 25 | 5 | 57.4% | 57.0% |
| Scale | $200.00 | $18.40 | $58.10 | 60 | 15 | 57.2% | 57.0% |

## What the AI usage buys

Guidance only. One "turn" here is a question with some conversation before it and a few paragraphs back (1,500 tokens in, 500 out). Files, pictures, web research, long answers and agent runs cost more, and real use varies widely.

| Plan | Turns a month on GPT-6 Luna | Turns a month on Claude Sonnet 5.5 |
| --- | --- | --- |
| Starter | 941 | 47 |
| Plus | 13,162 | 658 |
| Pro | 34,556 | 1,727 |
| Business | 69,623 | 3,481 |
| Scale | 137,987 | 6,899 |

## What this says about $3.99

- The payment fee on a $3.99 charge is $0.76, about a fifth of the price, because 40 cents of it is fixed.
- Billed monthly, $0.40 a month is left for AI. That is enough for everyday chat on a fast model, and not for the stronger models or the build agent.
- Billed once a year, the fixed fee is paid once, and $0.76 a month is left for AI: 1.9 times as much. A yearly Starter is the stronger offer.
- Starter should say plainly what it is: everyday questions and writing on the fast model, with a clear monthly allowance. Images, video and the build agent belong to Plus and up, or to top-ups.

## Scenarios

Arithmetic on assumptions, not forecasts. The mix is assumed: 45% Starter, 35% Plus, 12% Pro, 5% Business, 3% Scale. Use is assumed at 60% of each allowance. Farbaek has no measured mix or use for these plans yet.

| Paying subscribers | Revenue a month | Revenue a year | Per subscriber | Variable cost | Contribution | Contribution margin |
| --- | --- | --- | --- | --- | --- | --- |
| 100 | $2,580 | $30,955 | $25.80 | $757 | $1,823 | 70.7% |
| 500 | $12,898 | $154,773 | $25.80 | $3,784 | $9,114 | 70.7% |
| 1,000 | $25,796 | $309,546 | $25.80 | $7,568 | $18,228 | 70.7% |
| 5,000 | $128,978 | $1,547,730 | $25.80 | $37,839 | $91,138 | 70.7% |
| 10,000 | $257,955 | $3,095,460 | $25.80 | $75,679 | $182,276 | 70.7% |
| 50,000 | $1,289,775 | $15,477,300 | $25.80 | $378,394 | $911,381 | 70.7% |

If every subscriber used everything, the same mix keeps 58.6%.

## Not in this model

- **Fixed costs beyond the server's share:** salaries, marketing, legal, the app stores' developer fees. They come out of contribution, and are the owner's numbers.
- **The app stores' cut.** A plan bought inside the iPhone or Android app pays Apple or Google 15% to 30% instead of the payment fee here. Those prices need their own row before they are set.
- **Taxes** are added on top at checkout and are not revenue.
- **Refunds, discounts and free trials** lower revenue; none is assumed.
- **Free.** It has no revenue, so it has no margin; its cost is carried by the paying plans' share of fixed costs.
- **Top-ups**, which add usage at the same 57%.
- **Image, video and voice** each need a limit of their own, since one video costs far more than one chat turn. One unit is $0.00 of provider list price, whatever it is spent on.
- **Measured use.** The mix and the 60% are assumptions until real subscribers exist on these plans.

## To decide

1. The five prices, and whether Starter is offered monthly, yearly or both.
2. The hours of test space and the seats for each plan.
3. Which models and tools each plan includes.
4. What happens to today's plans and their subscribers.
