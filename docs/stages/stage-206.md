# Stage 206: Chat researches when a question needs it, in depth when it's a task, and shows what it cites

- **Date:** 2026-11-20
- **Branch:** `feat/stage-206-research-brain`
- **Decision:** ADR 0223
- **Migration:** none. **New dependency:** none. **New service or setting:** none (the same `WEB_SEARCH_URL` and `WEB_READER_URL` as stage 205).

## What the owner asked

A next-generation research assistant: search only when needed and deeply when the task is research; never noise as sources; natural Sinhala in its own script, in English letters and mixed with English; excellent English and other languages; citations in the text with the sources closed under the answer; answers that take the shape of the request; the desktop agent in the picture; all measured, with honest results. Reference screens came with it, among them one from Farbaek where a Sinhala question typed in English letters was answered with a people-finder page and a farming site as sources.

## Where it stood (measured before any change)

- "mata ada tech industire eka aluth details denna" was read as Sinhala (right), but the plan made without a model searched for the sentence as typed, with no freshness and no news search.
- "hi", "kohomada machan" and "write a poem about the sea" each searched the web.
- The planner model had 2.5 s; a miss sent the raw question to the engines and logged nothing about why.
- One depth for every question. "Latest" limited the general web to the last 24 hours.
- Nothing checked whether a result was about the question, and nothing checked the answer's citations.
- The desktop app (read by a separate agent): eight tools on a project copy, every command approved on the computer, no screen, mouse, keyboard, browser or app control, and no way to send it a request from Chat.

## What was built

- **Whether to search** (`src/core/web/intent.ts`, `intent-words.ts`): none, search, deep or unsure, from the message's own words, in English, Sinhala (script and English letters) and thirteen other languages. A greeting counts only when nothing else is in the message.
- **Planning** (`src/core/web/plan.ts`, `src/server/web/planner.ts`): the planner model also decides whether the web is needed and whether the task is deep, writes up to five searches and the subject in English, gets today's date and four seconds, and can't skip a search the person asked for. A query it writes in English-letter Sinhala is read into search words. Misses are logged with their reason.
- **The Sinhala fallback** (`src/core/web/gloss.ts`): request words dropped, about a hundred common topic words to English in some 390 spellings (the fast-typed ones counted from an Apache-2.0 set of comment pairs), the rest kept; Sinhala script also searched as written, in Sinhala.
- **Ranking** (`src/core/web/rank.ts`): Reciprocal Rank Fusion, relevance to the plan's words, freshness, the subject's own site, local sites for a Sri Lankan question, contact-list sites down, one copy of a syndicated story, two per site, noise dropped.
- **Research** (`src/server/web/research.ts`): quick, standard and deep; a second round for deep tasks; a dated search retried without its date when nearly empty; "today" on the general web asks for recent pages; each query searched in its own script's language; the time the web was really checked.
- **A short search cache** (`src/server/web/search/cache.ts`): 2 minutes to an hour by freshness, in memory.
- **Citations** (`src/core/web/citations.ts`): the model cites by number; the finished answer's citations are tied to real sources and each cited sentence's figures, dates and names looked for on its page; saved with the sources (`cited`, `support`, `checks`).
- **The turn** (`src/server/chat/turn.ts`): reads the need before reserving; no web room and no planner for a message that needs none; room for a deep task whenever the planner runs; the answer kept marked live during long research; citations checked before the answer ends; "Check the web" (`research: "search"`).
- **The model's instructions** (`src/server/ai/chat-model.ts`): citations by number, the shape of an answer by request, choices, never claiming an action; and a Sinhala style note beside the language note (`src/core/chat/language-style.ts`).
- **Requests to act on the computer** (`src/core/chat/intent.ts`): told from questions; the model is told from one list what can't be done.
- **On screen**: research progress lines ("Checking what's still missing", "Looking again for …"); citations as small links naming the site; one closed Sources button with the sites beside it, and inside it the cited pages, the others, dates and the check's result; choices as buttons; "Check the web" on an answer written without a search; hand-off chips only where they fit; a second sample conversation in the demo workspace.
- **Records**: the privacy policy (searches in memory for up to an hour; "when a question needs current information"), `CLAUDE.md`, `current-state.md`.

## Measured

All of this runs with `pnpm exec vitest run src/core/web/eval src/core/chat/intent.test.ts`. None of it calls a model.

**The sets written with the rules** (`need.golden.ts`, `need-sinhala.golden.ts`, `gloss.golden.ts`, `citations.golden.ts`; 153 need messages, 36 Sinhala questions, 20 cited sentences). Their first run found three real bugs: a question ending in "kohomada" was read as a greeting and skipped; in a sentence with two scripts a leading English name wasn't treated as a name; short Sinhala questions about prices weren't read as Sinhala. After the fixes every floor holds: no needed search skipped, every nothing-to-look-up message answered at once, every stated web need caught, 99 of 99 topic words found with no request word leaked, 20 of 20 cited sentences read as labelled and 0 of 8 unsupported ones passed as matched. These sets and the rules share an author, so they hold the behaviour in place; they don't prove it.

**A held-out set** (`heldout.json`: 170 need messages, 50 computer requests and questions, 40 Sinhala questions), written by a separate agent from the label definitions alone, without seeing any code. Measured once before anything was changed, then after:

| | First run, untuned | After fixing what it showed |
| --- | --- | --- |
| Messages that needed the web (or might) read as needing none | 3 of 126 | 0 |
| Nothing-to-look-up messages answered at once | 27 of 44 (61%) | 44 of 44 |
| Messages whose words ask for the web, caught without a model | 70 of 72 (97%) | 71 of 72 |
| Research tasks read as such | 11 of 14 | 14 of 14 |
| Searched though nothing needed looking up | 3 | 0 |
| Requests to act on the computer recognised | 16 of 25 | 24 of 25 (25 before the review made the patterns stricter) |
| Questions taken for such a request | 1 of 25 | 0 |
| Topic words in the fallback query, Sinhala in English letters | 62 of 75 (83%) | 75 of 75 |
| Topic words in the fallback query, Sinhala script | 22 of 28 (79%) | 28 of 28 |

The first column is the honest measure of how the rules do on messages they haven't seen. The second is what they score now that those messages have been used to fix them, so it is no longer unseen: the three wrong skips were one bug (the greeting rule again, for three-word questions), the misses in the middle rows were greetings in other languages, sums and "shorten this:" messages, and the fallback's misses were vocabulary it lacked (inflation, flood, scholarship, Jaffna). The fallback's word list will always lack words; it is the fallback, and the planner model reads Sinhala without it.

**Other checks**

- Research in tests with a stand-in search and reader: depth levels, the second round (stages in order, only new searches run, both small calls counted, page text never sent to the planner), noise dropped, nothing-relevant said as such, the retry without a date, news kept to the day, a query's own-script language, the cache's times, Stop at every step, the breaker.
- The turn: a greeting isn't searched and reserves no web room; "Check the web" searches a poem; a short English question that needs the web is planned without a model and an unclear one goes to the planner on its own reservation; a Sinhala question in English letters carries its need to the planner and gets the Sinhala style note; a request to act on the computer isn't searched and the model is told what it can't do; the finished answer's citations are checked, saved and sent before the answer ends, with an invented number counted; a long research step keeps the answer marked live.
- On screen (static render): sources closed by default with no links until opened; the count of cited sources; "pages checked, none cited"; nothing for an answer that needed no search; a citation is a safe link naming the site; side-by-side citations are one link with a count; a number with no source draws nothing; an index after a name and code are never citations; choices are buttons only where they can be pressed, a plain list elsewhere, nothing while still streaming, and markup in a choice is shown as text.
- In a browser (the demo workspace, development server, 1280 and 375 wide): the second sample conversation shows citations after the full stop, the Sources button with "3 sources" and the sites, the opened list with cited pages, dates, "updated", the check's lines and "Also checked"; at 375 px no sideways scroll, the button 44 px tall; no console errors.
- The whole suite, the type check and lint: see the end of this record.

## A fresh review, and what it found

A second agent read the stage without having written it, with the code and no conclusions. It confirmed that both reservations are settled or refunded on every path, that Stop is honoured after every wait, that the deadlines hold to within half a second, that source numbers are unique across rounds, that the notes and the system prompt are fixed text, that nothing a model writes can become HTML or a script link, that a choice sends exactly its own words, and that answers saved before this stage still draw. It found real problems, all fixed and held by tests (`src/core/web/review.test.ts`, and cases added to the turn, research and intent tests) before the pull request:

- **One message could freeze the server.** "calculate", 31,000 spaces and "1+1 a" took two minutes in the pattern for a sum, before any usage was reserved. The pattern now runs only on a message of 100 characters or fewer and has bounded runs; the same message is read in under a millisecond. Every other pattern over a person's message now reads only its beginning.
- **Ordinary requests were read as requests to act on the computer**, and would have been answered with a refusal: "Write a press release for me", "Update the app to use React 19", "Use the browser's localStorage API", "Add retry logic to the system", "Create a PDF checklist for reviewing my documents", and more. Every pattern now needs the order at the start of the message and either the person's own machine in so many words or a thing that only exists on a computer; "for me" and words like "system" and "the app" no longer count; the note itself tells the model to answer as usual if the message is about something else. 42 such requests and questions are in the test, none read as a request; the price is that "click the submit button for me" no longer is one. A request to act never outranks words that ask for the web.
- **Messages that needed the web were read as needing none**, because the rules for "work on my text" and "creative writing" ran before the words for now: "Polish election results today" (the verb "polish"), "Summarize this week's AI news", "Tell me who won best rap album at the Grammys", "Is this correct: the current president of Sri Lanka is …", and any message with a code block. An instruction that itself asks about now is searched or left to the planner, never skipped; "polish" is gone; creative writing needs "a" or "an" before its noun.
- **Slow paths over what a model writes.** The citation check took seconds on tens of thousands of dots, brackets or citation marks, and would have taken far longer at the 190,000-character limit, before the answer was saved. It now reads at most 80,000 characters, 6,000 a line, 300 citations, ten facts a sentence and the first 120,000 characters of a page, with no pattern that takes more than a pass; five hostile answers of 190,000 characters each are checked in well under a second and a half.
- **Square brackets were rewritten in answers with no sources**: "Smith [1]. Later work [2], [3]" lost its spacing, and "the interval [0, 1]" became a citation of source 1 in a searched answer. Citations are now read only when the answer has numbered sources, and never with a zero in them.
- **Cited sources could be lost.** The saved list was trimmed to fit before the answer existed, so an answer citing sources 11 and 12 of twelve long addresses had both counted as invalid and neither drawn. The check now runs against every page the model was given, and the list is fitted afterwards, uncited sources first.
- **The privacy statement wasn't met**: a kept search older than an hour stayed in memory until 300 newer ones pushed it out. Every call now removes what is older than an hour first. And a search made for a question about today was kept ten minutes, not two: the question's own freshness now sets how long.
- Smaller: a page that redirected could be read again in the second round under a second number; a continued answer lost the standing of sources checked earlier; a message of only request words ("mata kiyanna") was searched as typed. All three fixed.

## What couldn't be checked here

- **What the live models write.** No live model call and no real SearXNG search was made from this PC (the keys are off limits here and there is no Docker), so no real answer and no real planner call ran. After the merge, in the owner's signed-in Chrome on production: the two reference questions ("mata international tech news kiyanna", "mata ada tech industire eka aluth details denna"), the same in Sinhala script and in English; a greeting and a poem (no search, no "Checking the web"); a deep task ("Research the latest developments in AI agents across the world": two rounds on screen); an explicit "search for …"; "Open my browser and go to …"; a follow-up that leans on the turn before ("Ewa desktop ekak control karanna puluwanda?"); whether the models cite as `[n]` and keep to the Sinhala style note. The server log's `web.planner_missed` lines say how often the planner is late and why.
- **How natural the Sinhala reads.** That is a native speaker's judgement on live answers. The style note is built from published work and from how Sinhala is written online today; whether it lands is the owner's read.
- **Search quality from one server address.** Bing was reported returning unrelated results and Google refusing SearXNG in November 2026; the noise filter and the nothing-relevant message cover the first, and the breaker the second, but how often they happen is only visible in production.
- **The model's use of choices**: when it offers them, and whether too often.

## Research this stage rests on

Read on 2026-11-20 by two research agents; the briefs name every source. The ones the decisions lean on: Cormack, Clarke and Büttcher, "Reciprocal Rank Fusion outperforms Condorcet and individual rank learning methods", SIGIR 2009 (k = 60); Honovich and others, TRUE, 2022 (word overlap ROC AUC 63.8 against 81.5 for a trained checker, why the citation check only warns); Gao and others, ALCE, 2023, and Liu and others, 2023 (how often answers lack support for what they cite); GPT Researcher, LangChain open_deep_research, Jina node-DeepResearch and Vane (the shape of a research loop: plan, parallel searches, one gap check, a stop); SearXNG's search API and issue tracker (time ranges, engines skipped under a date limit, engine health); OpenAI's and Anthropic's web search tool pages (both $10 per 1,000 searches: named for later); the IndoNLP 2025 shared task on romanized Sinhala (pure rules fail on real typing, which is why the word list is only the fallback); Swa-Bhasha's Apache-2.0 comment pairs (the fast-typed spellings); Rajapakse and Weerasinghe, 2026, and Jayakody and Dias, 2024 (models read Sinhala better than they write it); the Tulu prompting study, 2026 (naming what to avoid helps most); SinhalaMMLU (CC BY-NC-ND), Sinhala-GLUE and NSINA (research only): none of them used, here or in tests.

## Skills used

`farbaek-ui` and `farbaek-human-made` (the Sources button, the citation links, status glyphs, plain words, sizes), `taste-skill:redesign-skill` (the audit of what read as generic: three chips under every answer, the open source list; where it disagrees with Farbaek's own rules, such as texture and placeholder pictures, Farbaek's rules won), the built-in browser skill for the look in a browser. Research went to agents with written briefs rather than a research skill.

## Next

1. The live check above, and tuning from what it shows (the planner's timeout, how often "unsure" becomes a search).
2. The computer-control stage (ADR 0223, "Not built"): its threat model first.
3. Sources on shared chats (still needs a migration, from stage 205). Until then a shared answer shows its citations as the numbers the model wrote, with no link: before this stage they were links in the text.
4. A trained citation checker and a second search provider, when there is a budget.

## Checks at the end

- `pnpm typecheck` and `pnpm lint`: clean. `pnpm build`: succeeds.
- `pnpm test`: 474 files and 4,109 tests pass, 17 skipped. The run also reports one error outside any test, from a Mesh file-transfer test's temporary folder not being empty when it is removed on Windows; it was there before this stage's changes and has nothing to do with them.
- The chat and web suites alone (19 files): 427 tests pass.
- In a browser after the review's fixes (demo workspace, development server): the sample answer's three citations are links to their sources, no citation number is left as text, the Sources button reads "3 sources" and is closed; the other sample conversation shows no sources and no hand-off chips.
