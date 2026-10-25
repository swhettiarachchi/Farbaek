# Stage 58: Outcome watch

Spec Stage 8 lists the real-world outcome watch. Here it's an hourly check that what's live keeps answering, as the version that should be live, with alerts when it stops and when it's back.

- **Decision record:** `docs/adr/0080-outcome-watch.md`.
- **Branch:** `feat/outcome-watch`, on top of `feat/phone-app` (PR #70).

## 2026-10-25

### Done

- **Migration v50** (`20261121090000_outcome_watch.sql`):
  - `outcome_watches` keeps the last 24 results;
  - `app_set_outcome_watch` is for contributors and audited;
  - `app_record_watch_result` decides the state: down after two failures in a row, back up on the next good check, each change returned once and audited. Nothing live leaves the state alone.
  - **Applied in production** and read back.
- **`src/server/jobs/outcome-watch.ts`:** checks each watch due within the last 50 minutes. A Farbaek Site is judged against exactly its live version (header and home page SHA-256, as the button does). A Vercel launch's public address counts sign-in protection as answering. It alerts only on a change.
- **The wiring:** finds what's live (the site first, then the latest ready Vercel launch), records the result, and sends an email and a push to whoever turned the watch on. The watch runs from the hourly jobs, and the Health page names it.
- **The Launch page:** an "Outcome watch" card with the state in words and an icon, the last 24 checks as a strip (failed ones striped as well as red) with a summary sentence, the last check, and the toggle.
- **The threat model** has an outcome watch section.

### Verified

- `tests/db/outcome-watch.test.ts` (4): who may turn it on, the down and back-up rule with one alert each, nothing live, 24 kept, read-only for browsers, gone when off.
- `src/server/jobs/outcome-watch.test.ts` (4): the site judged against its live version, alerts only on a change and only to the right person, nothing live, the Vercel judgement.
- `src/components/launch/outcome-watch.test.ts` (5): every state in words, the summary, the stripes, and the reason when it can't be changed.
- `pnpm typecheck` and lint are clean; the design tests pass.

### Next

Counterfactual policy replay (spec Stage 8).
