# ADR 0223: Chat researches when a question needs it, at the depth it needs, and shows what it cites

- **Status:** accepted (stage 206, 2026-11-20)
- **Builds on:** ADR 0222 (live web search), ADR 0221 (the language note), ADR 0220 (routing, GPT-6 Luna first), ADR 0213 (Farbaek Chat), ADR 0218 (hand-offs from an answer), ADR 0175 (every command on a person's computer needs approval)
- **Changes:** ADR 0222's "every text question checks the web first", its one fixed depth, its "cite inline as Markdown links" and its sources list open under the answer; ADR 0218's three hand-offs under every answer

## Context

The owner (2026-11-20) asked for Chat to become a research assistant of the first rank: search only when a question needs it, go deep when a task is research, never pass off noise as sources, natural Sinhala in any spelling, sources closed by default with citations in the text, answers that take the shape of the request, and the desktop agent in the picture. Reference screens from another assistant came with it, and one from Farbaek: "mata ada tech industire eka aluth details denna" (Sinhala in English letters for "give me today's news from the tech industry") had been searched as typed, and the sources under the answer were a people-finder page for someone named Denna and a farming site called Mata.

What the audit found:

- **The question was the query.** The planner model had 2.5 seconds; when it was late or failed, the question itself went to the search engines, in whatever language or spelling. Nothing looked at whether results were about the question.
- **Everything was searched.** "hi" and "write a poem about the sea" waited for a search they had no use for.
- **One depth.** One to three queries and five pages, for a price check and for "research the AI industry" alike.
- **"Latest" meant the last 24 hours** on the general web, where the page that answers is often weeks old.
- **Sources took the screen.** Four were listed open under every answer, cited or not, and three hand-off chips (picture, video, website) sat under an answer about the news.
- **Sinhala was decided, not styled.** The language note said which language to write; nothing said how, and models fall into the register of official documents or translate English sentences word by word.
- **Chat knew nothing of the computer.** "Open my browser" got whatever the model chose to say. The desktop app works on a copy of a Farbaek project, with every command approved there; nothing in Farbaek can see a screen, move a mouse, type, or drive a browser or another app, and nothing sends the desktop app a request from the web.

Research before deciding (sources and dates in `docs/stages/stage-206.md`): rank fusion needs no scores from the engines and beat the methods it was compared with (Cormack and others, 2009); open research agents converge on a plan, parallel searches, one check for gaps and a stop; matching words is a weak test of whether a page supports a sentence (TRUE, 2022), so such a check may warn but not vouch; naming what not to write improved a low-resource language's output more than examples did (Tulu, 2026); Sinhala benchmarks (SinhalaMMLU, Sinhala-GLUE, NSINA) are licensed for research only; OpenAI's and Anthropic's own search tools cost $10 per 1,000 searches plus tokens.

## Decision

**Whether to search is read first, from the message's own words** (`src/core/web/intent.ts`), with no model call:

- *none*: a greeting or thanks (only when nothing else is in the message), a question about the assistant, creative writing, the person's own text to translate or rewrite, pasted code, a sum. The answer starts at once and the model is told the web wasn't checked.
- *search*: the message names something that changes (news, a price, the weather, a score, a release, "latest", "today", who holds an office, a recent year), in English, Sinhala in either spelling, or thirteen other languages; or it asks for a search, a check or sources in so many words.
- *deep*: a research task: research, an investigation, a full report, a market analysis, a comparison on several points.
- *unsure*: anything else. The planner model decides, and without one Farbaek searches.

A rule for "none" never wins over words about now: "Summarize this week's AI news" is searched, and an instruction that is half one thing and half the other goes to the planner. A message that asks for the web is always searched: the planner model can't overrule the person's words. A message with nothing in it to search for (only request words) isn't searched. "Check the web" on an answer written without a search asks again with one.

**The planner decides the rest** (`src/core/web/plan.ts`, `src/server/web/planner.ts`): whether the web is needed, the searches, the subject in English keywords, freshness and news. It has four seconds and is told today's date. Its queries are checked: one written in a language typed in English letters is read into search words or dropped. When it is late or fails, the plan made without it never sends a Sinhala question as typed: the question is read word by word (`src/core/web/gloss.ts`), request words dropped, common topic words turned to English, everything else kept; in Sinhala script it is also searched as written, in Sinhala.

**Three depths**, chosen from the question, never by the person: quick (one search, four pages, 9 seconds), standard (two or three searches side by side, six pages, 12 seconds), deep (up to five parts, then a second small model call for what the pages found don't cover and up to three more searches, twelve sources, 36 seconds). The second call reads the task, the searches and page titles, never page text.

**Results are ranked before anything is read** (`src/core/web/rank.ts`): lists merged by Reciprocal Rank Fusion; weighed by how many of the plan's words the title and snippet carry, by a dated result's age against how fresh the question needs it, by the kind of source (the subject's own site up, a .lk site up a little for a Sri Lankan question, people-finder and contact-list sites down); the same story on several sites kept once; two per site. A result with none of the plan's words is dropped once three others have some, and when none have any, the model is told the search found nothing on the question. No list of trusted names.

**Freshness.** On the general web "today" asks for recent pages and news keeps the day; "latest" and a price mean recent. A dated search that comes back nearly empty runs once more without its date limit. Searches are kept in memory for two minutes (today), ten (this week) or up to an hour (no date), so a repeat doesn't go to the engines twice; a result from there carries the time its search ran, and that is the time the answer says the web was checked.

**Citations are numbers, and Farbaek draws them.** The model cites `[2]` after the sentence a source supports and writes no addresses and no list. On screen a citation is a small link naming the site, "+2" when there are more; a number with no source behind it draws nothing. Under the answer, one closed button ("3 sources") with the sites beside it; opened, the pages the answer cites, then the others checked, each with its dates.

**The finished answer's citations are checked** (`src/core/web/citations.ts`), with no model: each cited sentence's figures, dates and Latin-letter names are looked for on the page it cites (so a Sinhala sentence about an English page can be checked). Each cited source then says "the names and numbers cited are on this page", "some weren't found" or "weren't found". It is named for what it is and never "verified". A sentence with only ordinary words is never marked as unsupported, and a source read only as a snippet is left unchecked when something is missing.

**How to write the language** (`src/core/chat/language-style.ts`): a style note follows the language note. Sinhala's names the register (today's everyday written Sinhala, spoken verb forms), what to avoid (the forms of official documents, word-for-word translation, coined technical terms), how to address the person, and that English technical words stay in English letters. Other languages share one sentence. The person's message still goes to the model unchanged.

**The shape of an answer** is said in the system prompt: a short answer for a simple question, steps as a list, a comparison as a table, news by date and story, a report with its short answer first. An answer may end with up to six choices in a fenced `choices` block, drawn as buttons that send their own text; anywhere they can't be pressed they are a plain list.

**Requests to act on the computer** (`src/core/chat/intent.ts`) are told from questions about doing so. Reading a request where there is none is the worse mistake (the answer would refuse something nobody asked for), so a pattern needs the order at the start of the message and either the person's own machine in so many words or a thing that only exists on a computer; such a request never outranks words that ask for the web. The model is told, from one list of what the computer side can and can't do, that it can't act and must never say it did, to help the person do it themselves, and to answer as usual if the message is about something else. Under such an answer one chip opens the desktop app's page. Hand-off chips now show only for a request about that kind of thing.

## Not built, and why

- **Screen, mouse, keyboard, browser and app control.** A new, security-critical surface in the desktop app: native input libraries, a screen-reading model loop, per-action approval and undo, signed releases for two stores. It needs its own stage with its own threat model (what an on-screen instruction may never trigger; which actions always ask; isolation of the browser profile it drives). Chat is honest about its absence instead.
- **Sending a request from Chat to the desktop app.** The only bridge today carries a task's check commands. A free-text bridge is the same decision as the line above.
- **A trained checker for citations**, a paid search provider and the models' own search tools: named for later. No budget now, and an adapter never run against its real service would be a fabricated integration.
- **Storing page text as evidence.** The privacy policy says page text isn't stored. The pages are kept in memory for the answer's own check and then dropped; what is saved is each source's address, dates, whether it was read, whether it is cited and how the check came out.

## Consequences

- Everything here that reads a person's message or a model's answer does bounded work: only the beginning of a long message is read, a sum is only looked for in a short one, and the citation check has a limit on every side. A fresh review found two patterns that didn't (one could hold the server for two minutes); tests now time hostile inputs.

- A greeting, a poem or a rewrite starts with no search and no planner call. A question whose need isn't clear costs one small planner call (about a second) that may save a search.
- A deep task can take 36 seconds before its first word, with its progress on screen, and reads up to 12,000 tokens of web text on any tier.
- Answers saved before this stage keep working: their Markdown links still draw as links, and their sources list opens the same way.
- The measured floors (`src/core/web/eval/`) fail the build when a later change makes need reading, the Sinhala fallback or the citation check worse.
- The privacy policy now says searches stay in memory for up to an hour.
