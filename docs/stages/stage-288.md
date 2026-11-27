# Stage 288: research you can find again

- **Date:** 2026-11-27
- **Branch:** `feat/stage-288-research`, from stage 287's branch (merged as #344 while this one was being built)
- **Decision:** ADR 0296 (research you can find again)
- **Part of:** the briefs' Research Studio (A19, B10, B11), first step; item 12 in the order of work.
- **Migration:** none. **New dependency:** none. **New paid service:** none.
- **Skills used:** `farbaek-ui` and `farbaek-human-made` (rows that are sentences, numbers only where they are real, "sample" said where it is one); `ecc-security-review` (whose rows are read, what goes into a filter's text, what a link can and can't make Chat do); `premium-app-ui` and `ui-ux-pro-max` (one question and one box, lists only when there is something in them).

## Why

Research lived inside Chat. A question that had read twelve pages last week could only be found again by remembering which conversation it was in. Everything needed to list it was already kept with each answer.

## What was built

- **A place, Research** (`/app/research`), in the one list of places after Build; under More on a phone.
- **Your research:** every answer of the person's that searched the web and kept a page, by its question, with what it cited of what it checked, how its citations checked in the check's own terms, the sites it cites, the day and its project. A row opens its chat. A question answered again is listed once.
- **Kept up to date:** what a scheduled task or an agent researches by itself, one row for each, by its latest run.
- **A box that hands a question to Chat.** It waits in Chat's box for the person to send; sent as it was handed, it asks for the live web.
- **Nothing new is stored.** `src/core/research/library.ts` holds what counts as research and every sentence about it; `src/server/research/library.ts` reads it as the signed-in person in plain reads.
- **The demo** shows research made from its sample chats, labelled as a sample.

## What a person no longer has to do

- Remember which conversation a piece of research was in.

## Verified

- **Tests,** all new unless said:
  - `core/research/library.test.ts` (13): what is and isn't research; a question answered again listed once; a task's thirty runs listed as one row; what is cited counted and named, not every page found; an answer that cited nothing says so; sites named by address as Chat names them; the limits; the title; the sentence for what it was; the citation sentence in the check's own terms, never "verified"; "and others" only when there were more sites.
  - `server/research/library.test.ts` (5): the filters the read sends (this workspace, answers, finished or stopped, a search done); a scheduled task's conversation read apart and listed once, with only a real id ever put into the filter's text; null, never "none", when the answers or their chats can't be read; still listed when the tasks or the questions can't be; nothing researched, and an archived chat left out.
  - `content/research-samples.test.ts` (2): the demo has a row to show, and it says of the sample what Chat says of it.
  - `components/app/app-nav.test.ts` (changed): the list of places with Research; Research lit on its page; Research a row on the phone's More page.
  - The whole suite, run after the last change: 5,589 passed, 21 skipped (as before), none failed.
- `tsc --noEmit` with a 4 GB heap, and `pnpm lint`: clean.
- **`pnpm build`:** passed after the last change, with the 4 GB heap.
- **The project's own audits,** on the running demo: `qa:responsive --strict` on Research and Chat at 375, 1180 (touch) and 1280, and `qa:a11y` on Research: no findings.
- **Looked at in the demo workspace,** at 1280 and 390 px, light and dark: the page with its sample row ("A search: 3 sources cited, of 4 pages checked. The names and numbers cited were found on 2 of 3 cited pages. From example.org, example.com and example.net."); Research lit in the sidebar; a question typed in the box arrived in Chat's box, not sent; Chat's strip with Research in it.
- **A fresh review** of the change by a separate agent, after the first checks had passed. It found no way for one person to see another's research, and twelve real things. Fixed:
  1. a scheduled task's runs would have flooded the list with identical rows and pushed the person's own research off it: they are read apart and listed once each;
  2. the citation sentence said more than the check does ("carry what the answer says"): it now says what was found, in Chat's terms;
  3. the hand-over to Chat belonged to "the next message", so a different message could be sent with the web forced, and a failed send lost it: it belongs to the question handed;
  4. a row counted and named every page kept, where Chat counts and names what is cited;
  5. every question's whole text was read to make titles: only the listed rows' are;
  6. stopped answers were left out without saying so: they are read;
  7. "Reports" was a search word for a page with no reports; these notes did not exist;
  8. a site's name was worked out differently from Chat's;
  10. the globe already means a published site in the app: Research has the magnifier;
  12. the read had no test, and nothing held the demo's row in place.
- **Named and not fixed** (in the ADR's "Not yet"): an edited question is listed as two, and a row opens its chat at the latest message (9); Chat's folded rail scrolls on a short screen now that it has ten icons (11).
- **Not verified:**
  - **A real person's list on production.** The read sends a filter on what an answer keeps (`meta` contains a search that is done); that it returns the right rows from the real database is read from the code and the fake reader's steps, not seen.
  - **A question sent from the box with a live model,** and that it searches with the web switch off.
  - **The "Kept up to date" rows on a screen:** the demo has no scheduled research.
  - **A real phone, and 200% text.**

## Next

- After the merge: open Research on production and compare a row with its chat.
- Asking Farbaek from anywhere, by voice or text, from the search box.
- Research: reports saved on their own, what changed since last time, a project's knowledge.
