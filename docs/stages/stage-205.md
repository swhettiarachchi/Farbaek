# Stage 205: Farbaek Chat checks the live web before every answer

- **Date:** 2026-11-17
- **Branch:** `feat/stage-205-web-search`
- **Decision:** ADR 0222
- **Migration:** none. **New dependencies:** `@mozilla/readability` 0.6.0 and `linkedom` 0.18.14 (exact pins, approved with the plan; used only by the page reader). **New services:** SearXNG and the page reader, in `deploy/vps/compose.yaml`.

## What the owner asked

Real-time web access as a core capability: every question automatically searches the live web, reads the actual pages, verifies, and answers with clickable citations and timestamps, for GPT-6 Luna, Claude and every other model through Farbaek's orchestration; failures handled honestly, never pretending; extensible to more providers. No button or mode. No budget for paid services.

## What was built

- **The page reader** (`src/server/web/reader/*.mjs`), its own container: public addresses only, checked three times (the URL, every resolved address, the connected socket); ports 80 and 443; up to three redirects, each checked; a deadline per page; 1.5 MB after decompression; HTML and text in their own character sets; robots.txt as FarbaekBot; pages that opt out give their title only; Readability on linkedom; six pages at once, two per site; pages kept in memory for ten minutes, never stored.
- **Search** (`src/server/web/search/`): SearXNG on the VPS (Bing, DuckDuckGo, Brave, Qwant, Wikipedia and news), behind a provider interface, with a breaker that rests after three failures in a row.
- **Planning** (`src/core/web/plan.ts`, `src/server/web/planner.ts`): a short first English question becomes the query directly; otherwise the answering provider's fast model writes one to three queries and a freshness, checked, with the local plan as fallback; queries cleaned of contact details, numbers, links and secrets.
- **Research** (`src/server/web/research.ts`): one 9 s deadline; the best pages read and the rest given as snippets; numbered, dated sources in markers with a random tag, invisible characters removed, marked as material and never instructions (`src/core/web/context.ts`); honest notes when the web couldn't be checked, found nothing, or was switched off.
- **The chat turn** (`src/server/chat/turn.ts`): research after the answer starts and before the model is asked; the results after the question for this answer only (the saved question unchanged), in the first try, every fallback and the retry without older files; the web budget reserved and taken from the conversation's room; the planner's own reservation settled or refunded on every path; a continued answer keeps citing its sources; the sources saved with the answer and read back validated.
- **Providers:** Claude gets a cache breakpoint just before the web results, so the conversation stays cached; OpenAI gets them last; both gained a one-shot call for the planner. The system prompt's "can't browse" line became the rules for using results.
- **On screen:** "Checking the web", "Searching the web for …", "Reading N pages"; the sources under each answer (title, site, date, safe links); "Web not checked" or "Web search off" with their status badges; when it was checked in Details; a "Search the web" switch in the composer's menu, on by default.
- **Elsewhere:** `/bot` explains FarbaekBot to site owners; the privacy policy says what goes to search engines; `deploy.sh` treats a failed start like an unhealthy deploy; `scripts/dev/fake-searxng.mjs` stands in for SearXNG on a computer without Docker.

## Verified

- **The address policy:** 33 cases, including every refused range, IPv4-mapped and NAT64 forms, scoped link-local, and public addresses allowed. A real bug found and fixed on the way: Node's BlockList checks IPv4 addresses against IPv6 rules too, so one shared list refused every IPv4 address.
- **The reader, with a local test site:** reads a page; refuses a redirect to a name resolving privately and one to a numeric address; stops after three redirects; caps a gzip bomb after decompression; gives up on a trickling page at its deadline; refuses a PDF; decodes Shift_JIS; follows robots.txt; never more than two pages of a site at once or six in all.
- **The reader against the real internet** (run locally): Wikipedia, Python.org, Node.js and BBC News read with their titles, sites and text; localhost, 169.254.169.254, `supabase-gw:8000`, `[::ffff:172.18.0.1]` and a non-standard port refused for the right reasons (a first run refused them by way of robots.txt instead, so the address check now comes first).
- **Research end to end, locally:** the real SearXNG client against the stand-in and the real reader against real pages, in 1.5 s: planned, searched, read, numbered sources with retrieval time; a page whose robots.txt forbids bots given as a snippet.
- **Unit tests:** SearXNG (request, dates, blocked engines, failures, "this week"), research (snippets, opt-outs, failures and the breaker, nothing found, not set up, news), the planner (valid, nonsense, local), plan, sources (the 5.5 KB limit with three-byte titles) and context (markers can't be closed early, invisible characters), the chat turn (search first and sources saved, failure told, not set up, switched off, acknowledgements, continue, the reservations, Stop during research), Claude's cache breakpoint, and the sources on screen.
- Lint and the type check on everything changed; the design, SEO and legal tests.

## A fresh review, and what it found

A second agent read and probed the stage without having written it. It confirmed the address checks hold against every notation it tried (decimal, octal, hex and short IPv4, mapped and tunnelled IPv6, zone ids, trailing dots, a look-alike `localhost`, credentials, ports), that rebinding is covered, that a 50 MB gzip bomb is refused in 19 ms, that links are safe, that nothing from pages reaches the system prompt, and that the turn, the reservations, caching and the compose file are right. It found real problems, all fixed and tested before the first pull request:
- **A robots.txt rule could freeze the reader**: `*` became `.*` in a backtracking pattern, so a rule like `/*a*a*a*…b` took seconds and a slightly longer one never finished. Now a linear matcher, with long and star-heavy rules ignored; the hostile rules take about a millisecond.
- **Long paragraphs were dropped**: a paragraph longer than the room left was never kept, so a page that was one long paragraph reached the model empty, marked as read. Now it's cut to fit.
- **One Stop blocked a site for five minutes for everyone**: the shared robots.txt request used the first reader's stop signal. It now runs on its own time limit.
- **Hidden text survived**: Unicode tag characters (an invisible instruction), variation selectors and fillers weren't removed, and titles could carry new lines; a continued answer's source list wasn't cleaned. All cleaned now, keeping the joiners Sinhala and Indic writing need.
- **A long final address lost all sources on reload**: it's checked and the search's own address used instead.
- **Stop counted as a search failure** (three in a row rested search for everyone): it isn't counted now.
- Smaller: a continued answer hid its sources until reloaded; the switch couldn't be reached with the arrow keys; the 9 s could run to 9.5 s.
- Suspected and closed anyway: the reader now also refuses the server's own public address, which Caddy trusts as the server itself. And `deploy.sh` now pulls SearXNG's image with three tries before starting, so a brief Docker Hub outage doesn't fail a deploy.

Also found on the way: an edit had turned escape sequences into raw invisible characters in the source; they're written as escapes again, and a scan of every file in the stage finds no raw bidirectional or invisible characters.

## Not verified yet

- SearXNG itself: the dev PC has no Docker, so it first runs on the server. After the merge: the containers run, SearXNG answers JSON from inside the app container, the reader refuses internal addresses from inside the server, memory headroom, and real questions in the owner's Chrome (today's news, a product released this month, an exchange rate, a Sinhala question typed in English letters), with one Claude conversation to see cache reads above zero.
- How often the search engines block a single server's searches, over days.
