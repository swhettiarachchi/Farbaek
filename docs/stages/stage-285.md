# Stage 285: the three levels of how much Farbaek shows

- **Date:** 2026-11-26
- **Branch:** `feat/stage-285-experience-levels`, from stage 284's branch (its PR, #341, was still open)
- **Decision:** ADR 0293 (three levels of how much Farbaek shows: Standard, Advanced, Professional)
- **Part of:** the briefs' "three experience levels: Standard, Advanced, and Professional modes with different levels of interface complexity" (A18, B4); item 7 in the order of work.
- **Migration:** none. **New dependency:** none. **New paid service:** none.
- **Skills used:** `farbaek-ui` and `farbaek-human-made` (one choice written as three plain rows that each say what they show, no chip, no number without a sentence); `ui-ux-pro-max` and `premium-app-ui` (progressive disclosure, nothing out of reach, 44px rows, the same control on phone and desktop, both looks); `ecc-security-review` (the level is a cookie anyone can set, so nothing may be permitted or refused by it).

## Why

The owner's rule is the most intelligence behind the scenes and the least complexity in front of the person. The sidebar's "More tools" group had thirteen rows and Chat's menu listed every model, the same for a person asking their first question and a developer running a team. The briefs ask for three levels.

## What was built

- **One rule in tested code** (`src/core/experience/level.ts`): the three levels in order, Standard when nothing is chosen, the cookie as written and as read, what a level lists (`atLevel`), and the plain line that says where the rest is.
- **The choice** (`LevelChoice`), in Settings ("How much Farbaek shows") and in Chat's settings: three rows, each saying what it shows before it is pressed. Pressing one turns the menus at once, with no reload, and keeps it for a year in the `fb_level` cookie, which the server reads for the first paint.
- **The sidebar's "More tools" and the phone's More page** list by level: 5 tools at Standard, 10 at Advanced, 13 at Professional.
  - The tool a person is on is always listed.
  - Where tools are left out, a last row, "Show more tools", leads to the choice and says how many and at which level.
- **Chat.** At Standard the menu beside the send button is "Answer style": it says Farbaek AI picks the model, keeps the answer style and the web switch, and offers "Choose a model yourself", which opens Chat's settings at the choice. From Advanced the list of models is there as before. At Standard every message, retry, edit and continuation asks for Auto.
- **Never a lock.** Search finds every page at every level, every page opens by its address, and nothing on the server reads the level to permit or refuse.
- **A year, on Safari too** (`src/server/http/keep-choices.ts`, called from the proxy): Safari keeps a cookie written by script for seven days, so a fresh load of a signed-in page sends the level's cookie and the look's back with a year's life. Only a known choice is sent back.

## What a person no longer has to do

- Read past eight tools they don't use to find the five they do.
- Choose a model before asking a question.

## Verified

- **Tests,** new unless said:
  - `core/experience/level.test.ts` (9): the order and the default; a saved choice read, and anything else taken as Standard; the cookie found in a browser's cookie text; the cookie written is the one read back; each level shows what the one before it does; Chat's models from Advanced; a menu listed in its own order with what is left; the page a person is on always listed; the line that says where the rest is.
  - `components/app/app-nav.test.ts` (6 new, 9 in all): the exact tools at Standard and at Advanced, and all thirteen at Professional; nothing lost between levels; the tool a person is on, and its pages, always listed; Survey Studio, All work, Tasks and the desktop app at every level; the phone's More page with its one row after the last tool and before the account pages; search's list has no level, and only tools carry one.
  - `core/chat/model-to-ask.test.ts` (3): a turn asks for the person's pick where their level lists the models, and for Auto where it doesn't, whatever was picked before.
  - `server/http/keep-choices.test.ts` (4): a known choice is sent back unchanged for a year; nothing when none was made; a made-up value is never put into a header; only a fresh page load, never a page's own request.
  - The whole suite, run after the last change: 5,551 passed, 21 skipped (as before), none failed.
- `tsc --noEmit` with a 4 GB heap, and `pnpm lint`: clean.
- **`pnpm build`:** passed after the last change, with the 4 GB heap its type check needs on this PC.
- **Looked at in the demo workspace** (a development server, sample data), at 1280 and 390 px:
  - Settings at Standard, light: the three rows, and five tools with "Show more tools" in the sidebar.
  - Pressing Advanced, then Professional: the sidebar went to ten tools, then thirteen, with no reload; the cookie read `advanced`, then `professional`.
  - On Rules at Standard: the sidebar listed Rules with the five.
  - Chat at Standard: the menu said "Farbaek AI picks" with the answer style and the web switch; "Choose a model yourself" opened Chat's settings; choosing Advanced there turned the button back to "Auto, Balanced" with the models listed.
  - The phone's More page at Standard, dark: nine rows before the account pages, then "Show more tools: 8 more are shown at Advanced and Professional."; following it landed on the choice. No sideways scroll.
- **The cookie's year, on the running demo** (requests sent by hand): a fresh page load carrying both choices got both back with `Max-Age=31536000`; the app's own move between pages got none; made-up values got none; a public page got none.
- **A fresh review** of the change by a separate agent, after every check had passed. It found no fault in how turns are built, in the React code or in the navigation, and three real things, all fixed:
  - the choice would last seven days on Safari and every iPhone browser, not a year, and take a hand-picked model with it (the look's cookie had the same life since stage 211): the server now sends both back for a year;
  - the words in Settings and in Chat's settings said the level only changes the menus, when at Standard it also decides who picks the model: they now say both;
  - this page had three unfilled lines.
  - It also noted two pieces under no test (the More page's rows, and Chat asking for Auto): each is now one tested function (`moreRowsAt`, `modelToAsk`).
- **A fault in one of those fixes, caught by the suite:** `modelToAsk` was first put in `core/chat/models.ts`, which reaches the plan catalog, so two browser components began to download what plans cost Farbaek. `tests/design/browser-imports.test.ts` failed on it. The function has its own module with no imports (`core/chat/model-to-ask.ts`).
- **Not verified:**
  - **On production,** with a real account and a real answer: that a message sent at Standard is answered by Auto when a model had been picked before. The request's own `model` field is set in one place per kind of turn and was read, not watched on the wire. Auto can still answer with a stronger model: a continued answer keeps the model that began it, and a short follow-up keeps the step the conversation was on.
  - **Safari itself.** That Safari keeps the cookie the server sends for its year follows from WebKit's published rule; it was not watched on an iPhone.
  - **200% text and a real phone.** Looked at in a desktop browser at phone width only.
  - **The owner's verdict** on which tools belong at which level.

## Next

- After the merge: check the build on production and try the choice with the owner's account.
- "Build" starting in one place (item 8 in the order of work).
- The level reaching Settings' own sections, Build's workspace, the studios and the apps; the choice kept with the account.
