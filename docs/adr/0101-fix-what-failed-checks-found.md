# ADR 0101: Fixing what failed checks found, with free retries

- Status: accepted (2026-10-28).
- Builds on ADR 0020 (each plan's retry reserve), ADR 0047 (one-step checks) and ADR 0100 (payments).

## Context

Each plan holds back about 5% of its AI budget for free retries (`ECONOMICS.retryHoldback`, `retryUnitsPerMonth`). The ledger can refund an entry as `free_retry` under a 31-day cap. The pricing page promised that a fix after failed checks that didn't work is given back. But nothing used the reserve, and a task whose checks failed had only one way forward: undo it through Recovery. On 2026-10-28 the pricing copy was corrected to "coming soon" until this was built.

## Decision

**A fix is a new task, linked to the one whose checks failed.**
- **Where:** "Ask the agent to fix it" is on a task in `FAILED` or `PARTIALLY_VERIFIED` with an approved contract.
- **Who:** contributors whose agent runs aren't turned off (ADR 0087).
- **What it creates:** a task "Fix: {title}" in the same project, linked by `tasks.fix_of_task_id` through `app_link_fix_task`. The link is in the same org, the source's checks failed, the task is fresh, and only one fix is open at a time (`FIX_OPEN`).
- **Its contract** starts as the approved one, plus one assumption naming the checks that didn't pass in the latest receipt. It's a draft: the person reviews and approves it like any contract. Nothing about the fix bypasses approval, policy, autonomy or permissions.

**The free retry.** After every check run and every agent run, `settleFixRetry` runs, from the same hooks as governed workflows (ADR 0092).
- **When it applies:** if the task is a fix and its own checks failed too, `app_refund_fix_task` gives back the AI usage it settled.
- **How much:**
  - whole ledger entries, oldest first, while the last 31 days of free retries stay within the plan's reserve;
  - the units go back to the grants they came from;
  - `fix_refunded_at` makes it happen once, with one `usage.free_retry` audit event.
- **By plan:** Free has no reserve, so it gives nothing back. The trial uses Starter's reserve.
- **A fix that passes** is charged like any other work.

## Consequences

- **Copy:** the pricing promise, the FAQ and the wallet card say it again, accurately.
- **The task page:**
  - a failed task shows the fix card, with the open fix or the last one and its state;
  - a fix shows which task it fixes.
- **Migration v63** (`20261204090000_fix_retries.sql`) is additive and is applied before the code, because the reader selects `fix_of_task_id`.
- **Not done:**
  - an agent run doesn't start a fix by itself: a person always starts it and approves its contract;
  - the receipt keeps hashes of check output, not the text, so the fix agent re-runs the checks to see what failed.
