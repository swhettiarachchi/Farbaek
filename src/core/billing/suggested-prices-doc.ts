/**
 * The suggested prices as a page the owner can read and decide from (docs/farbaek/FARBAEK_SUBSCRIPTION_ECONOMICS.md).
 * Written from suggested-prices.ts, allowance.ts and the rate card; a test fails when the page and the code differ, so
 * no number on it is typed by hand.
 */
import { ECONOMICS } from "./allowance";
import { modelName } from "./model-names";
import { ASSUMED_MIX, ASSUMED_USE, SUGGESTED_PLANS, SAMPLE_CHAT_TURN, aiBudgetYearlyUsd, chatTurnsGuide, planEconomics, scenario, type SuggestedPlan } from "./suggested-prices";
import { USD_PER_UNIT, type ModelId } from "./rate-card";

const usd = (n: number) => `$${n.toFixed(2)}`;
const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
const FAST: ModelId = "gpt-6-luna";
const STANDARD: ModelId = "claude-sonnet-5-5";
const SUBSCRIBERS = [100, 500, 1_000, 5_000, 10_000, 50_000];

function planRow(plan: SuggestedPlan): string {
  const e = planEconomics(plan);
  return `| ${plan.name} | ${usd(plan.priceUsd)} | ${usd(e.paymentFeeUsd)} | ${usd(e.allowance.modelBudgetUsd)} | ${plan.sandboxHours} | ${plan.seats} | ${percent(e.contributionMarginAtFullUse)} | ${percent(e.netMarginAtFullUse)} |`;
}

function buysRow(plan: SuggestedPlan): string {
  const units = planEconomics(plan).allowance.aiUnits;
  return `| ${plan.name} | ${whole(chatTurnsGuide(units, FAST))} | ${whole(chatTurnsGuide(units, STANDARD))} |`;
}

export function economicsDocument(): string {
  const starter = SUGGESTED_PLANS[0]!;
  const starterMonthly = planEconomics(starter).allowance.modelBudgetUsd;
  const lines: string[] = [
    "# Farbaek subscription economics: the suggested prices",
    "",
    "Written from the code by `src/core/billing/suggested-prices-doc.ts`. Don't edit by hand: change `suggested-prices.ts`, then run `WRITE_DOCS=1 pnpm exec vitest run src/core/billing/suggested-prices.test.ts`.",
    "",
    "**These are suggestions. Nothing here is sold.** Today's live plans and prices are unchanged, and they stay that way until the owner says yes: changing a live price is the owner's decision, in Dodo, the App Store and Google Play.",
    "",
    "## The rule",
    "",
    `Every allowance comes from one formula (\`allowance.ts\`, ADR 0103). From the price come, in order: the payment provider's worst-case fee (${(ECONOMICS.paymentPercent * 100).toFixed(0)}% and ${usd(ECONOMICS.paymentFixedUsd)} a charge), a share of fixed costs (${usd(ECONOMICS.fixedShareUsd)}), storage (${usd(ECONOMICS.snapshotUsd)}), the plan's hours of test space (${usd(ECONOMICS.sandboxHourUsd)} an hour), and ${(ECONOMICS.margin * 100).toFixed(0)}% kept. What is left is AI usage at the providers' list prices.`,
    "",
    "So the 57% is a floor, not a hope: the allowance is the cap, and a subscriber who uses all of it still leaves 57%.",
    "",
    "- **Contribution margin** is what the brief asks for: the price, less what one more subscriber costs.",
    "- **Net margin** also takes the share of fixed costs. It is 57% at full use, by construction.",
    "",
    "## What each price can include",
    "",
    "Hours of test space and seats are suggestions to decide on. The margins are at full use of everything the plan includes: the worst case.",
    "",
    "| Plan | Price a month | Payment fee | AI usage a month | Test space hours | Seats | Contribution margin | Net margin |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...SUGGESTED_PLANS.map(planRow),
    "",
    "## What the AI usage buys",
    "",
    `Guidance only. One "turn" here is a question with some conversation before it and a few paragraphs back (${whole(SAMPLE_CHAT_TURN.inputTokens)} tokens in, ${whole(SAMPLE_CHAT_TURN.outputTokens)} out). Files, pictures, web research, long answers and agent runs cost more, and real use varies widely.`,
    "",
    `| Plan | Turns a month on ${modelName(FAST)} | Turns a month on ${modelName(STANDARD)} |`,
    "| --- | --- | --- |",
    ...SUGGESTED_PLANS.map(buysRow),
    "",
    "## What this says about $3.99",
    "",
    `- The payment fee on a ${usd(starter.priceUsd)} charge is ${usd(planEconomics(starter).paymentFeeUsd)}, about a fifth of the price, because 40 cents of it is fixed.`,
    `- Billed monthly, ${usd(starterMonthly)} a month is left for AI. That is enough for everyday chat on a fast model, and not for the stronger models or the build agent.`,
    `- Billed once a year, the fixed fee is paid once, and ${usd(aiBudgetYearlyUsd(starter))} a month is left for AI: ${(aiBudgetYearlyUsd(starter) / starterMonthly).toFixed(1)} times as much. A yearly Starter is the stronger offer.`,
    "- Starter should say plainly what it is: everyday questions and writing on the fast model, with a clear monthly allowance. Images, video and the build agent belong to Plus and up, or to top-ups.",
    "",
    "## Scenarios",
    "",
    `Arithmetic on assumptions, not forecasts. The mix is assumed: ${SUGGESTED_PLANS.map((p) => `${(ASSUMED_MIX[p.key] * 100).toFixed(0)}% ${p.name}`).join(", ")}. Use is assumed at ${(ASSUMED_USE * 100).toFixed(0)}% of each allowance. Farbaek has no measured mix or use for these plans yet.`,
    "",
    "| Paying subscribers | Revenue a month | Revenue a year | Per subscriber | Variable cost | Contribution | Contribution margin |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...SUBSCRIBERS.map((n) => {
      const s = scenario(n);
      return `| ${whole(n)} | $${whole(s.monthlyRevenueUsd)} | $${whole(s.yearlyRevenueUsd)} | ${usd(s.revenuePerSubscriberUsd)} | $${whole(s.variableCostUsd)} | $${whole(s.contributionUsd)} | ${percent(s.contributionMargin)} |`;
    }),
    "",
    `If every subscriber used everything, the same mix keeps ${percent(scenario(1_000, ASSUMED_MIX, 1).contributionMargin)}.`,
    "",
    "## Not in this model",
    "",
    "- **Fixed costs beyond the server's share:** salaries, marketing, legal, the app stores' developer fees. They come out of contribution, and are the owner's numbers.",
    "- **The app stores' cut.** A plan bought inside the iPhone or Android app pays Apple or Google 15% to 30% instead of the payment fee here. Those prices need their own row before they are set.",
    "- **Taxes** are added on top at checkout and are not revenue.",
    "- **Refunds, discounts and free trials** lower revenue; none is assumed.",
    "- **Free.** It has no revenue, so it has no margin; its cost is carried by the paying plans' share of fixed costs.",
    "- **Top-ups**, which add usage at the same 57%.",
    `- **Image, video and voice** each need a limit of their own, since one video costs far more than one chat turn. One unit is ${usd(USD_PER_UNIT)} of provider list price, whatever it is spent on.`,
    "- **Measured use.** The mix and the 60% are assumptions until real subscribers exist on these plans.",
    "",
    "## To decide",
    "",
    "1. The five prices, and whether Starter is offered monthly, yearly or both.",
    "2. The hours of test space and the seats for each plan.",
    "3. Which models and tools each plan includes.",
    "4. What happens to today's plans and their subscribers.",
    "",
  ];
  return lines.join("\n");
}
