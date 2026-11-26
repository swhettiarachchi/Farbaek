# ADR 0288: A roundup written from the newsrooms' own feeds, with depth

- **Status:** accepted (stage 280, the Farbaek program, 2026-11-26)
- **Builds on:** ADR 0222 (the page reader), ADR 0223 (ranking), ADR 0285 (a roundup as stories), ADR 0215 and ADR 0220 (the model ladder).
- **Changes:** where a roundup's stories come from, how they are ranked, how deep each is written, and which model writes them. One new call on the page reader, `POST /feed`. No migration, no new dependency, no paid service.

## Context

Stage 278 gave a roundup its shape. On 2026-11-26, an hour after it went live, the owner ran the same message in ChatGPT and in Farbaek again and wrote: "ChatGPT provides much more detailed, well-structured, and professional responses, while Farbaek gives only very basic answers with limited information."

They were right, and the cause was not the shape. The same message was asked on production and its sources read:

- **The search returned front pages.** "Tech News | Today's Latest Technology News | Reuters", TechCrunch's home page, the Wall Street Journal's AI section: ten of them. Their titles are the question's own words, so they ranked first, and no story can be written from a list of headlines. Most refuse to be read by a program at all, so the model was given their one-line snippets.
- **Two sources were not pages.** The news search returned `https://go/v1/…`, a search engine's own redirect that nobody can open. It showed as a source called "go".
- **One page could be read,** and the answer said so honestly: one story.
- **Dates were wrong.** A front page's own date (2017, 2022) was shown as its story's.
- **The model was the fastest one,** with a quick answer's room: the message is seven plain words.

ChatGPT's answer had seven stories, each with a large picture, the specifics as a list, why it matters, a closing view of its own, and choices for what to read next.

## Decision

**A roundup is written from stories, and a newsroom's feed is where its stories are. Farbaek reads a few feeds that fit the subject, ranks stories above front pages, asks for each story in depth, and gives the work to a stronger model with room to write.**

### Where the stories come from

- **A newsroom publishes a feed for this:** its newest stories, each with its address, when it was published, a few lines of summary and often a picture, meant to be read by a program and shown with a link back.
- **Forty fixed feeds** (`core/web/feeds.ts`) under twelve topics: technology, AI, security, phones, startups, science, business, the world, Sri Lanka, cricket, sport and games. Each was fetched and found to answer on 2026-11-26.
- **A roundup reads up to six,** chosen by what its plan is about, turn by turn from each topic, never two from one newsroom. A plan about nothing in the list reads none, and the searches answer alone.
- **A topic is named by words that mean it.** "Headlines", "breaking", "global" and "companies" are in every request for news and name nothing; "security" alone is not about break-ins; the Olympic Games are not video games. The world's feeds are read for a roundup of the world, and give way to a subject named beside it.
- **Only these addresses are ever read as a feed.** Nothing a person, a model or a page writes is. The page reader fetches them under the rules a page has: public addresses, robots.txt, a size and a time limit.
- **Feeds wait in six places of their own,** as pictures do in theirs: six feeds read at once never hold the places pages are read in. One that hangs costs the roundup two and a half seconds and its own stories.
- **A feed is read as text, not as XML** (`reader/feed.mjs`): cut into items by plain searches for their tags, each field shown as words. No entity is expanded beyond the usual five and numbered characters, no document type is read, and nothing in a feed can make the reader fetch anything. A feed is kept for ten minutes, since it is the same for everyone.
- **A feed costs time by its length and no more.** The reader is one thread. An item, a field, a CDATA section and a block of script are each found with one search for where they open and one for where they close; an item over 200,000 characters is left out unread. A feed of ten thousand openings with no end is one pass.
- **When the search service is down, the roundup is written from the feeds.** The service is still told it failed, and while it rests a roundup still reads its feeds without trying it. Any other question is told at once that the web couldn't be checked, as before.
- **Only stories from the days the roundup covers** (three for "today", eight for "this week"), and none without a date.
- The searches still run beside the feeds, for a subject no feed is about and for what the feeds miss.

### Ranking a roundup

- **A feed's story is never dropped for its words.** A headline rarely says "tech news"; it is about the subject by where it came from. It is the feed's story still when a search found it first.
- **A front page counts for little** (`frontPageWeight`): an address with one part, or two without a date or a name of several words, is a section of a site ("technology/", "news/science-and-environment"). A story's address is longer, or has a number in its name. A feed's story is never weighed by its address at all.
- **A story dated well outside what the roundup covers counts for less still** (`stale`).
- **An address on a host with no dot in its name is refused everywhere** (`canonicalUrl`): it is no page on the web.
- A question with one answer is ranked exactly as before.

### Depth

- **Each story has three parts** (`ROUNDUP_SHAPE`): what happened and when; two to four specifics as a short list; and one line on why it matters.
- **Then the assistant's own reading of the day,** marked as that: what the stories point to and what to watch.
- **Then three or four choices to tap:** one theme on its own, more depth on one story, the same for a neighbouring field.
- **In a roundup, a source that wasn't opened gives its whole summary** (600 characters against 400 elsewhere), which for a feed's story is enough to write from.
- **A roundup has the research room a deep task has** (36,000 characters against 9,000 on the fastest tier), so ten sources each keep enough to be specific.

### Who writes it

- **On a paid plan a roundup goes one step up the model ladder.** By its words it is a simple everyday question; as work it is analysis across ten sources. It is read as "analysis, hard", which is the standard tier.
- **On Free it keeps the plan's own fast model.** A standard-tier roundup costs about a fifth of Free's allowance for the month, and a roundup is what people ask for daily and schedule. The sources and the shape do most of the work; the fast model has the same room to write in.
- **It may be written at 9,000 tokens** on every plan, against a quick answer's 4,096: eight stories with their specifics in Sinhala script don't fit in less.
- **It is a roundup only when the message is going to the web.** "Proofread this: good news, the updates are ready" has the words and is the person's own text to work on. With the web switched off there is nothing to round up, and the message is a plain question again.

### On the screen

- A story names its source once, on its last line; a citation of the same source inside its sentences draws nothing.
- The letter in the place of a missing picture is the site's own initial ("M" for news.mit.edu).

## Consequences

- "Tech news today" is seven or eight dated stories from several newsrooms, each with specifics, most with a picture, then a reading of the day and what to ask next.
- **A roundup costs more:** up to 36,000 characters read and up to 9,000 tokens written, against a quarter of each, and on a paid plan a standard-tier model. It is metered like any answer and counts against the plan's allowance. That is the price of the depth asked for; a question with one answer costs what it did.
- **The feeds are other people's.** One can move, stop, or change its terms. A feed that stops answering costs only its stories. The list needs a look now and then; each address has a date it was last seen to work.
- **A summary is the newsroom's own words.** The model is told to write in its own, and each story links to the page it came from.
- **Not yet:**
  - feeds in other languages, and Sri Lanka's Sinhala and Tamil newsrooms;
  - a person's own list of feeds or topics;
  - larger pictures, as the answer the owner compared it with shows: a picture is still not resized (ADR 0285);
  - reading the newsrooms' feeds for questions that are not roundups ("what happened with X today");
  - a roundup only the planner recognised, not the message's own words, is still written in a quick answer's room: the route is chosen before the plan is made;
  - measuring a roundup against a set of real questions with a model in the loop.

## Verified

See `docs/stages/stage-280.md`.
