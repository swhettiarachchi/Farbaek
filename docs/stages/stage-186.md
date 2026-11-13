# Stage 186: "Vibe coding" in the homepage headline

- **Branch:** `feat/vibe-coding-headline`, from `main` (07525aa).
- **ADR:** none (copy and metadata; no decision changes).
- **Migration:** none.
- **Skills:**
  - **Wording and look:** `farbaek-ui` and `farbaek-human-made`: sentence case, no em dashes, no claims the rules forbid, the hero's own type and motion kept.
  - **The hero:** `design-taste-frontend`'s hero rules (a short headline, one subtext, the same calls to action) and `ui-ux-pro-max`'s checks for line breaks at phone width.
  - **Research:** web search on how "vibe coding" is searched and what worries people about it.

## What the owner asked

Add "Vibe Coding" to the homepage's main headline for search visibility, redesigning the headline if needed, so it stays modern, compelling and good for both search and people.

## The reasoning

- **Search:** "vibe coding" is the phrase people use for describing an app in plain words and having AI build it. By mid-2026 the general term had passed its peak while "vibe coding platform" and "vibe coding tools" were still rising: people had moved from learning the idea to choosing a tool.
- **What people worry about:** AI-written code shipped without review. That's the gap Farbaek closes, so the headline pairs the search phrase with Farbaek's promise: verified.
- **The headline:** "Vibe coding for verified software." The last word still turns through software, websites and apps, so the headline names all three. The keyword comes first, it's two lines from 375 px up (three on the narrowest phones), and screen readers and search engines read the whole sentence: "Vibe coding for verified software, websites and apps."
- **Sentence case:** the owner wrote "Vibe Coding"; the site's headlines are sentence case, and search treats both the same.

## What changed

- **The hero (`hero.tsx`, `hero-word.tsx`):** the headline above; the words are now plural (software, websites, apps). The subtext names an app or website and Farbaek's AI agent.
- **Search listing:** the homepage has its own title, "Vibe coding for verified apps and websites | Farbaek" (52 characters), and description (151 characters), with a canonical address and sharing tags (Open Graph and a summary card). The root layout sets `metadataBase` from the site's address, so they're absolute.
- **Structured data:** JSON-LD for the organization, the website and the app (`src/core/seo/structured-data.ts`): facts only, with the Free plan's real $0 and no ratings or reviews.
- **FAQ:** "Is Farbaek a vibe coding tool?" answers plainly, including that small checked changes apply on their own only if the person turns that on.

## Verified

- **The HTML search engines get** (a production demo build): the title and description above; `rel=canonical` https://www.farbaek.com; Open Graph title, description, address, site name and type; a summary card; JSON-LD for the organization, the website and the app; one H1, "Vibe coding for verified software, websites and apps."
- **The look:** two lines at 375, 768, 1280 and 1440 px, three at 320 px, with the turning word in the accent; nothing scrolls sideways.
- **Audits on `/`:** `qa:responsive`, 11 page views from 320 to 1440 px, no findings; `qa:a11y`, 2 page views, no findings.
- **Tests:** `src/core/seo/structured-data.test.ts` (6, new: the title leads with "vibe coding" and fits 60 characters, the description is 120 to 160 characters, no em dashes or forbidden claims, absolute addresses, no ratings or reviews, only the Free plan's real price, and the script can't be closed from inside); `tests/design` (180) passes. Lint is clean, and the build (with its typecheck) passes.

## Not done

- **A sharing image** (an Open Graph picture): links share as a text card until one is made.
- **Search Console:** asking Google to recrawl the homepage after the merge is in the owner's Farbaek "F" Chrome profile.
