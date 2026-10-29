# Stage 82: Revenue in Office Space

Live payments have been on since 2026-10-29, so the overview's Revenue tiles, which said "Billing not connected", now show real figures.

- **Decision record:** `docs/adr/0106-office-revenue.md`.
- **Branch:** `feat/office-revenue`.

## 2026-10-29

### Done

- **`core/billing/revenue.ts`:**
  - monthly recurring revenue at list price, with a yearly plan as a twelfth;
  - paying workspaces by plan;
  - this month's live top-ups;
  - trial to paid over 90 days;
  - cancellations scheduled and payments overdue;
  - the month's margin after Dodo's worst-case fees and all AI list cost.
- **`server/office/revenue-data.ts`:** reads live accounts, paid live top-ups and recent trials, and returns null, never zero, when a table can't be read.
- **Office Space overview:**
  - four tiles: Monthly recurring revenue, Top-ups this month, Trial to paid, and Margin this month, estimated, against the 57% target with icon and words;
  - a by-plan table and a note on cancellations;
  - "Live payments are off" while they are;
  - a link to Payments.
- **Also:**
  - `/admin` no longer says payments aren't connected;
  - the metrics comment is updated.

### Verified

- **Unit (6):**
  - `revenue.test.ts` (4): live only, test cards never; yearly as a twelfth; the right states; fees; margin; trials over 90 days;
  - `revenue-data.test.ts` (2): the filters asked for, and null on a read error or a bad row.
- Typecheck, lint, design tests and the office guard tests are clean.

### Not verified yet

- **The signed-in Office Space page in a browser:** staff sign-in codes go to the owner's email. The owner sees it at officespace.farbaek.com.
