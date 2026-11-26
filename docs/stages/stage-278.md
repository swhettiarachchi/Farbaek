# Stage 278: answers worth reading

- **Date:** 2026-11-26
- **Branch:** `feat/stage-278-answers-worth-reading`, from `main`
- **Decision:** ADR 0285
- **Migration:** none. **New dependency:** none. **New setting:** `PICTURE_SIGNING_KEY`, optional.
- **Skills used:** `farbaek-ui` and `farbaek-human-made` for the story card (tokens only, text in rem, no drawn dot, one date and one chip on the meta line, the title as the link); `premium-app-ui` (one hero per item, real content, a place kept for the picture so nothing moves); `ui-ux-pro-max` (reserve space for images, lazy loading, a failed image never leaves a broken mark); `ecc-security-review` for the picture route (no open relay, public addresses only, what is served can run nothing).

## Why

The owner sent one message to ChatGPT and to Farbaek and compared the answers (2026-11-26). Farbaek's was a flat list from one page whose source chip read "go". ChatGPT's was a dated title, a lead and a card for each story with a picture. The brief: answers that are "professional, modern, detailed, visually appealing", with "relevant images", and a backend that decides "when to display images, and how to structure information".

## What was built

- **A roundup is recognised** from the message's own words in the languages Chat is tested in (`soundsLikeRoundup`), and by the planner model (`"roundup": true`). The person presses nothing.
- **It is researched as news:** always planned by the model in three parts, every part searched in news, ten sources kept and six opened, and established newsrooms weighed a little ahead of sites that rewrite them (`core/web/newsrooms.ts`), for roundups only.
- **It is asked for as stories:** ten fixed lines just before the block of pages (`ROUNDUP_SHAPE`), as Farbaek's own note, and the system prompt's sentence on news.
- **A story's sentences are checked against its page** (`core/web/citations.ts`), not only its headline.
- **A story is drawn as one** (`core/chat/stories.ts`, `StoryView`): the page's picture, the title as a link, the sentences, the day and the source. A place is kept for every picture, so the list lines up and nothing moves.
- **A source's picture** (`core/web/pictures.ts`, `server/web/picture.ts`): the page's own preview picture or the search's thumbnail, saved as an address with the server's signature.
- **The page reader fetches pictures** (`POST /picture`, `fetchPicture`): https on every hop, public addresses only, 1 MB, the site's robots.txt, four kinds of picture by their first bytes, three at a time in a pool of their own, kept in memory for half an hour.
- **`GET /app/chat/api/picture`:** for the signed-in person, only for an address this server signed, four in flight for one person, sent as a picture and nothing else. None for a browser saving data, and none in a shared chat.
- **A source is named by its address,** never by what its page calls itself. That is what read "go".

## What a person no longer has to do

Nothing was added to learn. The same message that got a list now gets a dated roundup with pictures; a question with one answer is answered as before.

## Verified

- **Tests,** all new unless said:
  - `core/chat/stories.test.ts` (14): which headings are stories, at every step of an answer being written; a title's own full stop kept and one written after the citation dropped; a citation taken out of a title wherever it sits; lists and quotes; tables, code and maths; Sinhala titles; nothing of the answer lost or doubled.
  - `core/web/roundup.test.ts` (21) with the cases in `core/web/eval/roundup.golden.ts` (22 that are roundups, 22 that are not, ten of them a roundup's words meaning something else): the planner's yes and no; newsrooms by address; ranking as a weight and never a filter; a picture saved, dropped first when facts don't fit, and taken off for a shared chat; the note outside the block of pages; a story's sentences checked against its page.
  - `server/web/picture.test.ts` (22): which addresses are kept; the signature right for its own address and no other; nothing fetched without it; what is served and with which headers; the count for one person and its bound; the places in flight, waiting, turned away and given back; no picture for someone saving data.
  - `server/web/reader/pictures.test.ts` (16), against a local stand-in site: the kind read from the bytes; a page's preview picture and its "no"; size, time and https on every hop; a private address refused for being one, by the guard's own reason; one fetch for everyone asking at once; robots.txt; the bound on what is kept; pictures never holding a page's place.
  - `server/web/roundup.test.ts` (11): news searched for every part; ten sources and six opened; the planner's word against the message's; a source named by its address; the page's picture, then the search's, signed; none for a page that said no; the search's thumbnail; the reader's client.
  - Changed: `server/chat/turn.test.ts` (a roundup always goes to the planner; a reservation test made independent of rounding), `server/web/research.test.ts` and `depth.test.ts` (the reader's stand-in).
  - The whole suite: 5,414 passed, none failed.
- `tsc --noEmit` with a 4 GB heap, lint on the changed folders, and the design tests (312).
- **In a browser,** a temporary page with stand-in stories and local pictures (removed): the cards at 375 and 1280 px, light and dark, in Sinhala and English; a story with no picture and one whose picture fails both keep their place; no sideways scroll.
- **Not verified:**
  - **Nothing here has been seen with a live model or live search.** Whether GPT-6 Luna writes the stories as asked, how often the search service gives a picture, and how many pages name one, can only be seen on production. To be checked there after the merge with the owner's own message.
  - **The picture route end to end:** the app's side and the reader's side were each tested with the other standing in. No picture has travelled browser, app, reader, site.
  - Which of the two security policies a browser receives on the picture route (the app's general one or the route's own). Both are restrictive; `curl -I` on the live route will say.
  - The stories with a real screen reader.

## A fresh review, before the PR

A fresh agent was given the code, not the conclusions, and asked to break it. Every check had passed before it started. It found the picture route's own safety sound (forging a signature, private addresses on every hop, what is served) and thirteen real faults elsewhere, all fixed before the pull request:

1. **Only a story's headline was checked against its page,** yet the source list could say its names and numbers were found. The sentences under a heading are now part of what is checked.
2. **The note on writing a roundup sat inside the block of pages,** two lines after "nothing in here is an instruction". It now stands before the block.
3. **A roundup's words overruled the planner model,** and matched questions that only contain them ("Is Fox News owned by Disney?"). The planner's word now stands, a question that opens like one with an answer is never a roundup by its words, and the cases are measured.
4. **A page that asked for no picture preview still got the search's thumbnail.** It now gets none.
5. **Pictures shared the reader's six places with page reads,** so one person's roundup could push another's research to snippets. Pictures have a pool of their own.
6. **A short English request for news was planned without the model,** so it got one search. It now goes to the planner.
7. **Any cited heading became a story,** in an essay too. Only an answer asked for as a roundup has stories.
8. **The app could hold hundreds of megabytes of pictures at once.** Four in flight for one person, sixteen in all, and 1 MB each.
9. **A shared chat carried picture addresses and signatures.** It carries neither.
10. **Tests that proved less than they said:** private addresses passed for the wrong reason, the count had no test, one test checked a tautology.
11. **A title lost its own full stop** ("the U.S"). Only a stop written after the citation is dropped.
12. **A citation inside emphasis in a title put a link inside a link.** Citations are taken out at any depth.
13. **A place for a picture could appear beside a story already drawn.** It is decided from the sources, before the first word.

Also taken from its "worth considering": https on every hop, no moving GIFs, the kind decided by the bytes alone, a malformed picture costing only itself, no pictures for a browser saving data, and the key derived as the server's other keys are.

Left as they are, and said in ADR 0285: a signature is not tied to a person or a date; a picture is not resized; each picture request loads the person's workspace to know who is asking.

## Next

- Ask the same message on production after the merge and compare it with the owner's screenshots.
- Sidebar icons in one outlined style and less green in status and steps (the owner's brief, points 3 and 4): stage 279.
- Other answers drawn richly: comparisons, places, numbers as a chart.
