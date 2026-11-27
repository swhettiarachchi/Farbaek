# Stage 289: ask Farbaek from anywhere, by voice or by typing

- **Date:** 2026-11-27
- **Branch:** `feat/stage-289-ask-anywhere`, from stage 288's branch (merged as #345 while this one was being built)
- **Decision:** ADR 0297 (ask from anywhere)
- **Part of:** the briefs' universal voice assistant (A15, B8), first step, on the web; item 14 in the order of work.
- **Migration:** none. **New dependency:** none. **New paid service:** none. **New provider:** none.
- **Skills used:** `farbaek-ui` and `farbaek-human-made` (one name for the box, a microphone that names the action, rows that are sentences); `premium-app-ui` and `ui-ux-pro-max` (one box for everything, nothing floating over content, 40px controls with 48px touch areas, phone rows of two lines); `ecc-security-review` (the typed words stay in the browser and out of the address; nothing is sent from the palette).

## Why

A question could be asked from Home and from Chat. From any other page a person had to go to one of those first. The palette that every signed-in page already has could only open a page or plan a build, and once eight characters were typed it always led with "Plan a build", whatever was typed.

## What was built

- **The palette takes a question.** "Ask Farbaek AI" and "Research" hand the typed words to Chat, where they wait in the box to be sent. Research also asks for the live web when it is sent as it was handed (ADR 0296). Nothing is sent, searched or charged from the palette itself.
- **What leads the list is one tested rule** (`rankCommands` in `src/components/app/command-match.ts`): a page that was named, else the question, and a build only when the words read as one (`readsAsBuild`). The palette only draws what the rule returns.
- **Speaking instead of typing.** A microphone button in the palette dictates with the browser's own recogniser, as Chat's box does. A short silence ends it; typing over what was heard ends it and leaves the box alone; closing the palette drops what was being heard. When the microphone is blocked or missing, the palette says so and says to type.
- **The Ask button** (`AskButton`), a microphone beside the sidebar's search box, opens the palette already listening. It is only there where the browser can hear.
- **One microphone at a time** (`use-speech.ts`): starting to listen in the palette, Chat's box or Survey's assistant ends the listening anywhere else and hands it its words.
- **Chat takes a question whenever it is handed one,** also on a new chat that is already open, without reloading the page.
- **On a phone a row is two lines:** the question keeps the row's width, and what choosing it does sits under it. Before, "Ask Farbaek A…" hid the question.
- **A fix to stage 288, found on production:** Research named a site "go" on three rows. Answers from 2026-11-26 had kept a search engine's redirect address as a source. A host with no dot is no longer named.

## What a person no longer has to do

- Go to Home or Chat to ask something.
- Clear the box and pick again because Enter planned a build from a question.

## Verified

- **Tests:**
  - `components/app/command-match.test.ts` (13, rewritten, with the app's real pages): a page named by its name or by one of its other names opens ("bill", "sandbox", "audit", "mission control"); a question is never taken for a page that holds its letters ("what can I do" against "Who can do what"); what reads as a build (8 examples) and what does not (19, among them "write a blog post about coffee", "my site is down", "find a coffee shop near me"); the rule stays quick on a line of 200,000 characters; nothing offered for one letter, a build only from a few words and only to someone who can build; the typed words' commands still follow a page that was named; nothing listed twice; every page and no typed command when nothing is typed.
  - `core/research/library.test.ts` (14, one new): a host that is no site on the web is never named.
  - The whole suite, run after the last change: 5,602 passed, 21 skipped (as before), none failed.
- `tsc --noEmit` with a 4 GB heap, and `pnpm lint`: clean.
- **`pnpm build`:** passed after the last change, with the 4 GB heap.
- **The project's responsive audit** (`qa:responsive --strict`), on the running demo after the last change: Home, Tasks, Projects, Chat, Research, Build, Settings and Scheduled at 375, 1180 (touch) and 1280, 26 page views, the open palette among them: no findings.
- **Looked at in the demo workspace,** after the review's fixes:
  - "bill" listed Billing and usage first, then the project, then Ask and Research; "sandbox" listed Test space first;
  - "what changed in solar panel prices" led with Ask, then Research; Enter opened Chat with the words in its box, not sent;
  - from that open new chat, a second question chosen as Research arrived in the same box, with no reload;
  - the microphone beside "Ask or search" in the sidebar, and the palette's own;
  - at 375 px: the palette from the header's button, rows of two lines 48px tall, the question readable, no sideways scroll.
- **A fresh review** of the change by a separate agent, after the first checks had passed. It found ten real things, all fixed:
  1. opened to listen, the palette read the words already in its box in the same breath as clearing them, so stale words led what was said: it starts from an empty box;
  2. on a new chat that was already open, the palette reloaded the page to hand a question over: Chat now takes one whenever it arrives;
  3. listening never ended by itself, and the next words heard overwrote what the person had typed meanwhile: a silence ends it, and typing takes the box over;
  4. closing the palette stopped the recogniser, which then delivered its words into a box that had gone: it drops them;
  5. a page's other name no longer opened it ("sandbox", "audit"), because the typed words' commands outranked it: another name typed from its start counts as the page's name;
  6. words that only mention a site or a shop read as a build ("write a blog post about coffee", "find a coffee shop near me", "my site is down"): the thing must lead the phrase or follow a making word;
  7. a question scored as a page when the page's name held its letters ("what can I do"): named means every word starts one of the page's words;
  8. the palette and Chat's box could listen at once, and two recognisers abort each other: one listens at a time;
  9. Enter confirming a word still being composed (Japanese, Chinese, Korean) chose a command: it is ignored while composing;
  10. the box had three names ("Search or jump to", "Ask, search or jump to", "Ask or search"): one name.
- **The fixes were checked by the tests and in the demo, not by a second review.**
- **Live, 2026-11-27 at about 16:05 (+05:30), after #346 was merged** (production build 4d6e2859d82e, the merge's own), in the owner's signed-in browser, nothing sent:
  - the sidebar's box read "Ask or search" with the microphone beside it, and the palette had its own;
  - "bill" listed Billing and usage first, then Ask and Research;
  - a question listed Ask, Research and Plan a build, in that order; Enter opened Chat with the question in its box and no message sent. The box was cleared afterwards;
  - Research no longer named a site "go": the rows that had read "From go." named their real sites.
  - **Found on the way:** the Agents tab on production still says "Your agents couldn't be read just now", so migration v108 (stage 275) has not been applied; v109 (stage 277) comes after it. The owner has both lines.
- **Not verified:**
  - **Speaking into it.** No words were spoken into the recogniser here: the path from heard words into the box is the one Chat's box uses, and the silence, take-over and one-microphone rules are read from the code.
  - **A build chosen from the palette:** the demo workspace cannot build, so "Plan a build" was never listed there. Its place in the list is held by the tests.
  - **Safari, Firefox and a real phone.**
  - **A word composed with an input method.**

## Next

- After the merge: open the palette on production, ask from a page, and speak into it if the owner's browser has a microphone allowed.
- The voice assistant's next steps: an answer in place, quick actions ("what needs me?"), a language picked for listening, and the phones.
- The public pages the briefs ask for (features, docs, about, contact, help, changelog), with no change to the homepage.
