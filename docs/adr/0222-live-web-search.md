# ADR 0222: Farbaek Chat checks the live web before every answer

- **Status:** accepted (stage 205, 2026-11-17)
- **Builds on:** ADR 0213 (Farbaek Chat), ADR 0215 and 0220 (routing between Claude and OpenAI), ADR 0221 (the language note), ADR 0035 (the VPS), ADR 0125 (a workspace's own Claude key)
- **Changes:** ADR 0213's "no web search inside answers"

## Context

The owner (2026-11-17): real-time web access is non-negotiable. Every question must automatically search the live web, read the actual pages, verify, and answer with clickable citations and timestamps, for every model, through Farbaek's own orchestration, never pretending a search worked; robust and extensible. No button, mode or pasted link from the person. The owner has no budget for new paid services.

Before this, Chat's system prompt said it couldn't browse, and nothing in Farbaek could search the web or fetch an arbitrary page.

## Decision

**Every text question checks the web first.** The only skips: continuing an answer (it keeps the sources it had), making an image, a bare acknowledgement ("thanks", "ok"), or the person switching off "Search the web" in the composer's menu (on by default, kept in this browser). A workspace on its own Claude key searches too, and its planner runs on its key.

**Search: SearXNG on Farbaek's own server.** Free and self-hosted; a private compose service pinned by digest to a release two weeks old, asking Bing, DuckDuckGo, Brave, Qwant and Wikipedia (and news from Bing, Brave and Qwant), with no records of searches kept. Its secret is generated at each start. Behind a `SearchProvider` interface, so another provider is one implementation. **Named for later, not built:** Brave's API (a free monthly credit, then about $5 per 1,000 searches), Tavily, and Anthropic's and OpenAI's own search tools ($10 per 1,000 plus tokens). An adapter never run against its real API would be a fabricated integration, so only SearXNG ships.

**Reading pages: a separate, locked-down reader.** The app never fetches a page address. A `reader` service, the app's own image running `src/server/web/reader/server.mjs`, sits only on a `web` network (internet and the app, never the database's network), as `node`, read-only, with no capabilities, 384 MB and half a CPU. Its rules:
- public addresses only, checked on an address in the URL, on every address a name resolves to, and on the socket's connected address (so a name can't switch to a private address between the check and the connection); private, shared, loopback, link-local and metadata, documentation, benchmark, multicast and reserved ranges refused, with every IPv6 form that carries an IPv4 address, and the server's own public address (Caddy trusts requests from it); ports 80 and 443 only; no credentials in URLs;
- at most three redirects, each checked like the first; one deadline per page; 1.5 MB counted after decompression; HTML and text only, in the page's own character set; six pages at once, two per site;
- robots.txt followed as FarbaekBot (RFC 9309), matched without regular expressions so no rule can make it hang, and fetched once per site for everyone on its own time limit; a page that opts out (`noai`, `nosnippet`, `none`, `tdm-reservation`) gives its title only; FarbaekBot has a public page at `/bot`;
- the article text by Mozilla's Readability on linkedom (two new dependencies, pinned); no page script runs; dates only from what the page says about itself, never `Last-Modified`;
- page text is kept in memory for ten minutes at most, never stored.

**Planning the searches.** A first, short, self-contained English question becomes the query directly. Otherwise the answering provider's fast model (GPT-6 Luna, or Claude Haiku) writes one to three queries and a freshness (day, week, month, year, any) in at most 2.5 s, reading only the question and the last few turns, never pages or files; its answer is checked, and the local plan is the fallback. Queries never carry email addresses, phone numbers, long numbers, links or anything that looks like a secret. The planner's call is reserved and settled as its own usage entry.

**One deadline.** The whole research step has 9 s; a page that can't be read in time is represented by its search snippet. Three failed searches in a row rest the search for a minute, so a service that's down costs answers no time. Stopping during research stops the answer, with nothing charged.

**What the model reads.** The best-matching passages of the best pages (by tier: about 3,000 tokens on fast, 6,000 on standard, 8,000 above; reserved before the answer starts), numbered with title, site, address, the page's own dates and when Farbaek retrieved them, after the person's question, in markers with a random tag per turn and with invisible and direction-changing characters removed, marked as material to read and cite, never instructions. The question as saved stays the person's own words. Claude gets an explicit cache breakpoint just before these results (and no automatic one), so the conversation before them stays cached; OpenAI gets them last. The system prompt's "can't browse" line became fixed rules: base the answer on the results, prefer recent and primary sources, compare them, give dates, cite inline with the given links only, quote at most a short sentence, say when the results don't answer.

**Honesty.** If the web couldn't be checked (no search set up, the service down, every engine blocked), the model is told and must start its answer by saying so, and the answer shows "Web not checked" with the reason. With search switched off, the model is told not to claim it searched. Nothing found is said as such.

**On screen.** "Checking the web", "Searching the web for …", "Reading 5 pages" while it runs; then the sources under the answer (title, site, date, links opening in a new tab with the existing safe-link rules), and in Details when the web was checked and what for. Saved with the answer (at most eight sources, tracking parameters removed, under 5.5 KB of the 8 KB a message's facts may hold).

## Consequences

- Every answer waits for the research step: about 1.5 s in a local test against real pages, at most 9 s.
- Answers cost more tokens (the web text), metered like the rest; on GPT-6 Luna well under a tenth of a cent, on the top tier up to about 8 cents.
- SearXNG scrapes search engines from one server's address; engines can block it, which the breaker and the honest failure cover. If it happens often, a free Brave key is the owner's choice to add.
- The privacy policy says what goes to search engines and what FarbaekBot does.
- `deploy.sh` now treats a failed `compose up` like an unhealthy deploy (marked failed, the previous version back). The running copy changes when `install.sh` is run again.
- Not in this stage: paid providers and models' own search tools; the model searching again mid-answer; sources on shared chats (needs a migration); PDFs in results.
