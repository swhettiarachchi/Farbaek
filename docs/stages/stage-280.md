# Stage 280: a roundup with depth, and every morning in one press

- **Date:** 2026-11-26
- **Branch:** `feat/stage-280-roundup-habit`, from `main` after stage 278 was merged
- **Decisions:** ADR 0288 (stories from the newsrooms' feeds, with depth), ADR 0287 (the every-morning offer)
- **Migration:** none. **New dependency:** none. **New paid service:** none.
- **Skills used:** `ecc-security-review` for the feed reader (fixed addresses only, read as text with no entity expansion, the page reader's own rules for fetching); `farbaek-ui` and `farbaek-human-made` for the offer's chip and the story's last line (one chip, plain words, a source named once); `ui-ux-pro-max` (progressive disclosure: the offer opens to one sentence and one button).

## Why

Stage 278 went live at about 10:40 on 2026-11-26. The owner ran their message in ChatGPT and Farbaek again and wrote that Farbaek "gives only very basic answers with limited information". The same message asked on production showed why: the search had returned ten front pages and two links nobody can open, one page could be read, and the fastest model wrote the answer in a quick answer's room.

Their rule for the product, the same day: maximum intelligence and automation behind the scenes, minimum effort for the person.

## What was built

- **Stories from the newsrooms' own feeds** (`core/web/feeds.ts`, `reader/feed.mjs`, `POST /feed`): forty fixed feeds under twelve topics. A roundup reads up to six that fit its subject, beside its searches, and takes their dated stories with summaries and pictures.
- **Ranking for a roundup** (`core/web/rank.ts`): a feed's story is never dropped for its words; a front page counts for little; a story dated far outside the roundup's days counts for less.
- **No address that isn't a page** (`canonicalUrl`): a host with no dot in its name is refused. That was the source called "go".
- **Depth** (`ROUNDUP_SHAPE`): each story is what happened, two to four specifics, and why it matters; then the assistant's reading of the day; then choices to tap.
- **Room, and a stronger model on paid plans:** a roundup has a deep task's research room and 9,000 tokens to write in on every plan. On a paid plan it goes one step up the model ladder; on Free it keeps the plan's fast model, so it can be asked for every day inside the allowance.
- **A roundup while search is down:** it is written from the feeds, and the search service is still told it failed.
- **A story names its source once,** and the letter where a picture is missing is the site's own initial.
- **"Get this every morning"** (`habitOffer`, `ScheduleOffer`): under a roundup asked for with no schedule, one press saves the same request every day at 8:00 in the person's time zone. Only for a message that asks for a roundup by itself and names no day of its own; never for a choice that was pressed. The card shows the message that will be asked.

## What a person no longer has to do

- Ask twice, or ask for "more detail": the first answer has the stories and their specifics.
- Open Scheduled, write the request again and pick a time, to have it every day.

## Verified

- **Tests,** new unless said:
  - `server/web/reader/feed.test.ts` (16):
    - RSS, Atom and RDF read into stories; a relative address and a picture in a story's own text; nothing but the newest few;
    - a declared entity never expanded (the "billion laughs" and a file read); no script, markup or hidden character; no address or picture it wouldn't open;
    - eight slow inputs (items, entries, titles, scripts, CDATA and tags that never close, and a long line of angle brackets), each read in a few milliseconds;
    - an entry too long to be a story left out and the next one read;
    - through the reader against a local stand-in site: one fetch for everyone, robots.txt, a page that isn't a feed, and a hung feed that never holds a page's place.
  - `core/web/roundup.test.ts` (30, nine new): the feeds list; feeds chosen by subject, from different newsrooms, never by "headlines", "global", "companies" or a bare "security"; a feed's story never dropped for its words, ranked above a front page, and still the feed's when a search found it first; a front page told from a story by its address, with short story addresses and section names both right; a page from 2017 counted for little; a host with no dot refused; the site's own initial.
  - `server/web/roundup.test.ts` (17, six new): a roundup written from dated stories with summaries and signed pictures when no page can be opened; only stories from its days; still answered when no feed answers; no feed read for a question with one answer; a deep task's room; the reader's client dropping anything that isn't a story.
  - `server/web/research.test.ts` (three new): only the fixed feeds that fit are read; with every search failing the roundup is written from the feeds and the search service is told it failed, and while it rests a roundup still reads its feeds without trying it; with searches down and no feed answering, it says the web couldn't be checked.
  - `server/chat/turn.test.ts` (one, rewritten): on a paid plan a roundup goes to the standard-tier model with 9,000 tokens of room; on Free it keeps the fast model with the same room; "Proofread this: Good news, the latest updates are ready." is not searched and is an ordinary request; a plain question as before, and a plain question again with the web off.
  - `core/automation/offer.test.ts` (five new): the every-morning offer, only for a message that asks for a roundup by itself, never for news of a named day.
  - `core/chat/stories.test.ts` (one new): the answer's choices after its last story leave it a story.
  - The whole suite: 5,458 passed, 21 skipped (as before), none failed.
- `tsc --noEmit` with a 4 GB heap, and `pnpm lint`: clean.
- **The reader, run on this PC against the real feeds** (2026-11-26, before the review's changes to how a feed is cut; not a test in the suite): eight of the forty were read through `POST /feed` in 0.7 to 1.4 seconds each, every item dated, 10 to 25 stories each; four of the eight carry a picture with every story. One real picture came back through `POST /picture` as a JPEG of 10 KB in 1.5 seconds.
- **All forty feed addresses** were fetched once with Farbaek's own user agent and answered with items. Four others tried did not (one refused, one empty, two were pages) and were left out.
- **Not verified:**
  - **The whole answer with a live model.** Whether the fast model on Free writes eight stories with their specifics in Sinhala, and how long it takes, can only be seen on production. To be asked there after the merge and put beside the owner's ChatGPT screenshots.
  - **The every-morning chip on a screen,** and a task saved by pressing it: it shows only under a real roundup for someone signed in.
  - **The real feeds after the review's rewrite of how a feed is cut.** The suite's stand-in feeds pass; the forty real ones are read again on production.
  - **Which story pages the reader may open.** Several newsrooms refuse programs; those stories are written from the feed's summary, which for some feeds is one sentence.
  - What the production server's reader is refused by. It answers from another address than this PC, and a newsroom may treat it differently.

## A fresh review, before the PR

A fresh agent read the feed reader, the feed choice, the ranking, the route and the offer. Six real faults, all fixed with a test each:

1. **The feed reader could be made slow.** Three patterns looked again from every opening tag: a feed of 20,000 unclosed items took half a second and four times as long for each doubling, on a reader that is one thread. Items, fields, CDATA and script blocks are now each found by one search for their end.
2. **Generic words picked the wrong feeds.** "Headlines" read the world's feeds for a technology roundup, "companies" the business ones, a bare "security" the break-in ones.
3. **The stronger model was chosen by the words alone,** before knowing the message would be searched, and on Free one roundup reserved about a fifth of the month's allowance. It is now decided after the web need is read, and Free keeps its own model with room to write.
4. **The search service was told it was well when every search had failed** and only the feeds answered.
5. **Six feeds at once took all six of the pages' places** in the reader. Feeds have their own.
6. **A real story with a short address was weighed as a front page,** a feed's own story included.

Also changed from its notes: the answer's choices no longer turn the last story back into a heading; a story found by a search and given by a feed stays the feed's; the every-morning offer is not made for a follow-up, a named day or a pressed choice, and its card shows what will be asked; a hung feed costs two and a half seconds at most; only a roundup's unopened sources give the longer summary.

Left as it is, and said in ADR 0288: a roundup that only the planner recognised still gets a quick answer's room.

## Next

- Ask the owner's message on production after the merge, and put the two answers side by side.
- Larger pictures; Sinhala and Tamil newsrooms' feeds; a person's own topics in the every-morning offer.
- The same depth for other kinds of answer: a comparison, a how-to, a decision.
