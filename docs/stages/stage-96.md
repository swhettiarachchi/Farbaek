# Stage 96: The Activity page

The spec audit found no Activity or audit page in the app. The database recorded more than 90 kinds of audit event, but people couldn't see them. This stage shows them.

- **Decision record:** `docs/adr/0119-activity-log.md`.
- **Branch:** `feat/activity-log` (from `feat/visual-editor`, PR #123).

## 2026-10-30

### Done

- **`src/core/workspace/activity.ts`:**
  - a plain sentence for every audit action the migrations write;
  - categories by action prefix;
  - links to tasks, projects and workflows;
  - the CSV writer, safe against spreadsheet formulas.
- **`listActivity`** in the readers:
  - Supabase reads through the person's session (row security), filtering by category and paging by id;
  - the demo shows sample events from its own sample projects and tasks.
- **`/app/activity`:**
  - category filters;
  - who did what and when;
  - details as JSON;
  - **Show older**;
  - **Download CSV** (`/app/activity/export`, up to 5,000 events).
- **Activity** in the sidebar and on the phone's More page.

### Verified

- `src/core/workspace/activity.test.ts` (6):
  - sentences with names and links;
  - unknown actions still shown;
  - links only for ids and real pages;
  - every prefix in exactly one category;
  - formula cells kept as text;
  - the CSV's exact shape.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`: 2,192 passed.
- **Demo build at 375px:** 13 sample events with sentences and links, no sideways scroll, the Projects and files filter shows only project events, and the CSV download returns the filtered rows with the right headers and filename. The event links are now full-height rows, so each is at least 44px tall.

### Next

- Search and a date range; streaming the log to the customer's own systems.
