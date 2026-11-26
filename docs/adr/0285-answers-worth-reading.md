# ADR 0285: Answers worth reading: stories with pictures, and a roundup researched as one

- **Status:** accepted (stage 278, the Farbaek program, 2026-11-26)
- **Builds on:** ADR 0213 (Chat's own Markdown, never HTML from the model), ADR 0222 (live web research, the page reader), ADR 0223 (search only when needed, numbered citations, ranking without trusted names).
- **Changes:** how a roundup of news is planned, searched, ranked and written; one picture for a source, fetched by the page reader; one signed-in route, `GET /app/chat/api/picture`; story cards in an answer. No migration, no new dependency.

## Context

On 2026-11-26 the owner sent the same message, "mata ada tech updates kiyanna" (Sinhala in English letters for "tell me today's tech updates"), to ChatGPT and to Farbaek, and sent both screens.

ChatGPT answered with a dated title, a short lead, numbered sections and a card for each story: a picture, a bold title, two or three lines, the day and the source.

Farbaek answered with a flat list of five lines, all citing one page, and the chip that names that source read "go". A second try leaned on sites that rewrite other people's news; one had a name one letter away from a well-known one.

Four separate things were wrong:

1. **The source's name.** A source was named by what its page calls itself (`og:site_name`), so a page could be called anything, "go" or "Reuters".
2. **The research.** A roundup was searched as a question with one answer: news was searched for its first query only, and nothing ranked a newsroom that reported a story above a site that rewrote it.
3. **The writing.** The system prompt asked for "one short section per story", and a fast model wrote a list anyway.
4. **The drawing.** Chat had no way to show a story as more than a paragraph. Pictures in the model's Markdown are never loaded (ADR 0213), rightly, so an answer had no picture at all.

## Decision

**A roundup is a kind of request. Farbaek recognises it, researches it as news from several newsrooms, asks for it as stories, and draws each story with its page's picture. The person does nothing new: there is no mode, no switch and no setting.**

### Recognising it

- A roundup is a request for news, updates or headlines on a subject, not for one fact (`soundsLikeRoundup`, `core/web/intent.ts`): "tech news today", "AI updates", "ada puwath", "අද ප්‍රවෘත්ති". "Did the launch happen today" and "what is new in Node.js" are not.
- A roundup's words can mean something else ("Is Fox News owned by Disney?", "how long does it take to digest lactose"). So a message that opens like a question with one answer is never a roundup by its words, and the cases live in `core/web/eval/roundup.golden.ts`.
- The planner model decides when there is one. It read the whole conversation, so its yes or its no stands; the message's own words decide only when it said nothing. A roundup always goes to the planner, however short and plain the message, so it is searched in three parts. A deep task is a report and is never a roundup.
- The plan carries it (`SearchPlan.roundup`), and the answer's saved facts say it (`SearchMeta.roundup`).

### Researching it

- **News is searched for every query,** up to three, not only the first.
- **Ten sources are kept,** against eight, and six opened: a roundup is many stories from many places.
- **Newsrooms count a little more** (`core/web/newsrooms.ts`): a result from an established newsroom is weighed 1.25. This changes ADR 0223's "no list of trusted names" for roundups only, and only as a weight:
  - A question with an answer is ranked as before. The subject's own site, the freshest page and the best match decide.
  - A roundup has no subject of its own to rank by, so without this a rewrite ranks level with the report it rewrote.
  - It is never a filter. A small site with a far better match still leads, and a test holds that.
  - The list is about a hundred organisations that report first-hand: wire services and papers of record, the technology and science press, and Sri Lanka's daily news. Nothing in it says a newsroom is right.
- **A source is named by its address** (`siteOf`), which it can't choose. What a page calls itself is no longer used anywhere.

### Writing it

- For a roundup only, ten fixed lines on how to write one come just before the block of pages the model reads (`ROUNDUP_SHAPE`, `core/web/context.ts`): a title with the date, a short lead, six to eight stories from several sources, each a level-3 heading that ends with its source's number, two or three sentences under it, a closing note on what to watch.
- **They stand outside that block, as a note from Farbaek.** Inside it nothing is an instruction, and a line of instructions there would teach the model otherwise. A page that copies the note gains nothing: its copy is inside the block.
- The lines are fixed in code. Nothing from a page or the person is put into them. They say to answer directly when the person asked one specific question.
- The system prompt's sentence on news says the same in fewer words.
- **Nothing is invented to reach a count,** and a result with no date or an old one is left out or dated.
- **A story's sentences are checked against its page.** The citation sits on the heading, and the day and the figures are in the sentences under it. The check of an answer's citations (ADR 0223) reads those sentences as part of what the source is cited for, so a wrong figure under a right headline is never called matched.

### Drawing it

- A story is ordinary Markdown: `### A title [3]` and the paragraphs under it. Copied, read aloud or shared, it is a heading and a paragraph.
- `core/chat/stories.ts` finds the pairs, and only in an answer Farbaek asked for as a roundup: in an essay, a heading that happens to end with a citation stays a heading.
- A heading is a story only when it carries a citation itself; a section whose sentences cite sources stays a heading, since a picture beside it would say the section is that page's. A story holds its first four blocks of text, and anything after them follows as it was written, so a story never turns back into a heading while it is being written.
- The screen draws a story as: the picture, the title as a link to the page, the sentences, then the day it was published and the source's chip.
- When any source of the answer has a picture, every story keeps a place for one, with the first letter of the site's name in it, so the list lines up and nothing moves when a picture arrives or fails. That is known before the first word is written. When none has, no place is kept.

### The picture

- **One picture for a source:** the one its page names for previews of itself (`og:image`), or the small one the news search gave with the result.
- **The browser never loads it from the site.** It asks Farbaek (`GET /app/chat/api/picture?u=…&s=…`), and Farbaek's page reader fetches it. So opening an answer tells no other site who is reading, and an address a page wrote can't make the browser call anything.
- **Only addresses out of Farbaek's own research are fetched.** Each address saved with a source carries a signature made on the server (HMAC-SHA-256, 27 characters kept), and the route fetches nothing without the right one.
  - What a signature says, and no more: this server kept this exact address as a page's preview picture or a search's thumbnail. It is not tied to a person or an answer and has no end date, so anyone signed in who holds one can ask for that one public picture again.
  - What bounds the route is everything else in this list.
  - The key is derived as the server's other keys are (HKDF from the secret it already has, with a label of its own); `PICTURE_SIGNING_KEY` is used in its place when set. With no key, nothing is signed and stories show without pictures.
- **The reader keeps every rule a page fetch keeps:** public addresses only, checked on every redirect and on the connected socket, one deadline, the site's robots.txt. A picture is also https on every hop, and 1 MB at most.
- **Only pictures pass:** JPEG, PNG, WebP and AVIF, decided by how the bytes begin, whatever the site calls them. Never SVG, which can carry script, and never GIF, which is usually moving. The app sends them with `nosniff`, a policy under which they could run nothing, and a kind from the short list.
- **Pictures never hold up research.** The reader fetches three at a time in a pool of their own, apart from the six places for reading pages. The app holds at most four in flight for one person and sixteen in all; the rest wait their turn.
- **A page can say no.** `max-image-preview:none` or `noimageindex`, in the page or its headers, means no picture at all for it: not its own, and not the search's thumbnail of it. A page that opts out of being used (ADR 0222) gives none either.
- **Someone saving data gets none:** a browser that sends `Save-Data: on` is answered with no picture.
- A picture goes first when an answer's facts don't fit their room: an uncited source's before a cited one's, and no source before every picture.
- For the signed-in person only. A shared chat shows stories without pictures, and carries no picture address or signature.

## Consequences

- An answer to "today's tech news" is a dated title, a lead and a list of stories with pictures, from several newsrooms, in the person's language.
- Farbaek now fetches pictures. That is new load on the reader: at most 1 MB each, three at a time, 24 MB kept in memory for half an hour; and on the app, which holds each picture whole while it passes it on: four at a time and 240 a minute for one person.
- **A picture is not resized.** The reader has no image library, and adding one is a dependency to ask for. A page's preview picture is often 100 to 300 KB for a 112 px square; one over 1 MB is not shown. The browser keeps each for a week.
- **When the model doesn't write the closing heading,** its last paragraph is drawn inside the last story. The note asks for the heading; nothing can force it.
- **The copyright position** is that of a link preview: a small picture the page itself names for previews, shown beside a link to the page, with its source named, and honouring the page's own instruction not to. It is not legal advice, and it is the owner's call to keep.
- **Not yet:**
  - pictures in shared chats and in answers read aloud or copied;
  - resized pictures;
  - other kinds of answer drawn richly: a product comparison with pictures, a place with a map, a chart from numbers;
  - a person's own choice of topics for a daily roundup, which belongs with scheduled tasks (ADR 0278);
  - measuring the roundup against a set of real questions with a model in the loop.

## Verified

See `docs/stages/stage-278.md`.
