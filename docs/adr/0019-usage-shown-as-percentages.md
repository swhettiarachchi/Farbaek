# 0019. Usage is shown as a share of each limit, not as credits

- Status: accepted
- Date: 2026-10-18

## Context

AI actions were metered in credits (ADR 0009, `src/config/credits.ts`), and the app showed them as numbers: "AI credits 10 of 100" on Billing, "Uses 3 AI credits · 90 of 100 left" on the contract editor and on Propose, "20 AI credits a month" on Pricing. The owner asked for usage shown the way Claude shows it: a panel with a bar per limit, the share used and when it resets, with no credit numbers for people.

## Decision

- **Credits stay the internal unit.** The ledger, the database checks under a lock, the costs per operation and `docs/billing/ai-credits.md` don't change. No limit changes either: the owner chose to keep the current windows (the whole trial, or the calendar month on a plan) rather than add a short "session" window.
- **People see percentages and reset times.** `src/core/billing/usage-view.ts` turns usage into "N% used" (rounded up, so any use shows; 100% only at the limit) and "Resets in 3 hr 15 min", "Resets Sun 12:30 PM", "Resets Nov 1", or "Ends with the trial on Oct 28", in the viewer's time zone.
- **Metered limits are meters; countable things stay counts.** AI usage, governed evaluations and sandbox time show as percentages. Seats, projects, agents and integrations keep "1 of 3", since people count those.
- **Where it shows:** a usage panel from the sidebar footer (loaded when it opens), the top of More on phones, and Billing. AI actions show nothing about cost; from 80% they say "You've used 84% of your AI usage. Resets in 3 days.", and at the limit they say the limit is reached and what still works by hand.
- **Counts never reach the browser** for metered limits: the server sends percentages and reset times only.
- **Pricing compares plans instead of listing allowances:** "AI usage included" on Free, then "5x", "25x" and "125x the AI usage of Free", derived from the catalog. The trial includes "as much AI usage as a month of Developer".
- A design test fails if "credit" appears in any page, component or user-facing server message.

## Consequences

- Plans can change their internal allowances without changing what people read, as long as the comparison to Free stays true (it's computed).
- Support conversations about "how much is left" use percentages; the exact counts are in the database for the owner.
