# ADR 0106: Revenue in Office Space

- Status: accepted (2026-10-29).
- Builds on ADR 0103 (the 57% margin), ADR 0104 (going live) and ADR 0105 (Lite and Maker).

## Context

Office Space's overview had four Revenue tiles that said "Billing not connected", by design until payments went live. Live payments are on since 2026-10-29. The owner's target is 57% net margin, so the owner needs to see revenue and the margin it earns.

## Decision

**The figures come from Farbaek's own records:**
- live subscriptions (`billing_accounts` with `provider_mode = 'live'` in a paying state);
- this month's paid live top-ups;
- trials that ended in the last 90 days;
- this month's AI list cost, which the overview already reads.

The sums are pure (`core/billing/revenue.ts`). Test-mode payments are never counted.

**The four tiles:**
- **Monthly recurring revenue** is at list price before tax. A yearly plan counts a twelfth of its charge.
- **Top-ups this month.**
- **Trial to paid:** trials that ended in the last 90 days, and how many of those workspaces pay now.
- **Margin this month, estimated:** this month's revenue, less Dodo's worst-case fee on each charge (a yearly plan's fee spread over twelve months) and all AI list cost, free and trial users included, before fixed costs. It shows whether that's at or above the 57% target, with an icon and words.

**Also on the page:**
- a table of paying workspaces by plan;
- how many are set to cancel or have a payment overdue.

**Honest by default:**
- While live payments are off, the tiles say "Live payments are off", never $0.
- A table that can't be read shows a warning, never a number.
- Every figure is labelled an estimate. Dodo adds tax and converts currencies, so its payouts are the exact figures.

## Consequences

- With worst-case fees and every AI cost counted, the margin shown is lower than or equal to the real one.
- Reconciling with Dodo's payouts is a later step; it needs Read on Payouts, which the live key doesn't have.
