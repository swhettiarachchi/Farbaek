# Stage 200: four spaces, and a new homepage

- **Date:** 2026-11-16 to 2026-11-17
- **Branch:** `feat/stage-200-platform-spaces`
- **Decision:** ADR 0214 (`docs/adr/0214-platform-spaces.md`)
- **Migrations:** none

## What the owner asked

A complete redesign of the homepage, studied against ChatGPT's overview, Google Antigravity and Claude's product page, and each feature given a dedicated interface of its own, the way those products give each part its own surface, while the platform still feels like one place. "Don't just redesign the homepage. Reimagine how users discover, navigate, and experience the entire Farbaek platform."

## What the references taught

- **ChatGPT overview:** one large sentence whose highlighted word changes the product window under it; a sticky tour (a list with a progress line beside a large live demo); a rail of use cases, each a tall card with a cropped piece of the interface; safety, pricing and a last call. Light, calm, generous space.
- **Google Antigravity:** each surface (app, command line, editor) gets a large rounded media panel and a short paragraph, sticky on the left; audience films; a blog rail. A typed headline.
- **Claude:** "hand Claude a task, not just a question": the page is built around jobs, with product cards for what it makes and numbered values.
- What none of them does: put everything on the first page. Each sends you to a page per product.

What we took: a homepage that introduces and routes, a page per space, a window that shows each space's interface, jobs rather than features. What we didn't: their gradients, typed headlines, playful props and carousels that move by themselves; Farbaek's own tells (proof, approvals, the knight) carry the identity instead.

## What was built

**Four spaces** (`src/components/site/spaces.ts`): Build, Chat, Survey Studio and Proof, each with a name, icon, public page, app address and one-line promise, read by every place that names them.

**The homepage** (`src/app/(site)/page.tsx`), from thirteen sections to nine:

1. Hero: "Vibe coding you can prove.", the lead and the build box. The headline is the largest paint, in the HTML.
2. Four spaces, one workspace: the platform window (`platform-window.tsx`), a real tab list with a tab per space. Each tab shows a glimpse of that space's interface (`glimpses.tsx`), drawn from tokens with sample content: Build's plan and steps beside the site taking shape; Chat's sidebar, a question with a PDF and an answer arriving, with the model named; Survey Studio's steps and the sample sheet drawn by the real plan code, with the lot areas from the survey engine; Proof's change waiting for approval and the sample ProofPack's Seal from its real digest. Each tab ends with its promise, the way to its page and the way into the app. The cat knight stands on the window's edge and peeks over once when it's seen.
3. The build film (unchanged).
4. The statement and the stage arc (unchanged).
5. Start with something you need: six jobs, each tagged with its space and drawn as a small piece of it.
6. Built in, not bolted on: approvals bound to the change, the security tests and ProofPack checks, each linking to the page that shows it working.
7. Pricing, questions, and "Start with one sentence."

**Pages for the spaces:**

- `/build`: the Loom and the knight from the old hero, beside the build box; the feature clips; the showroom; everything around the build (Studio with its sample diff, test space, skills, workflows, then launch, the desktop app, phones and moving projects, each with its honest "being proven" sentence).
- `/chat`: a question as the headline, the chat in light and dark (the real dark tokens, scoped to `.chat-root`), what it does, how private it is, and how it's metered.
- `/proof`: the Seal, the proof film, the approval demo, the ProofPack, what works today, and links to the security tests, the checker and the format.
- `/survey`: unchanged, now ending like the others with the rest of Farbaek.

Every space page ends with the other three (`other-spaces.tsx`), so people move through the platform without going back home.

**Navigation:** the header names the spaces and pricing and marks the page you're on (`site-nav.tsx`); the phone menu shows the spaces as cards with their promises, then pricing, security tests and the checker; the footer groups spaces, more, contact and the legal links. In the app, Survey Studio joins the main sidebar list (it was folded into Tools), stays under More on phones, and Home has doors into Chat, Survey Studio and approvals (`space-doors.tsx`).

**Removed:** the modules bento, the homepage's Survey Studio section, the cycling hero word and `DrawWhenSeen` (only that section used it). Film chapters may now link to another page's section (`/proof#evidence`); the films test says so.

## Skills used

`website-design:landing-page` (facts, sections and copy), `premium-app-ui` (one hero per screen, restrained palette, a single signature moment: the knight's peek), `farbaek-ui` and `farbaek-human-made` (tokens, shape lock, StatusBadge glyphs, no dots, model by product name), `ui-ux-pro-max` (tab pattern, touch targets, reduced motion), and the browser skills for the reference study and the checks.

## Fixed along the way

- **A fresh review** (no blocking bugs) found: `/proof` said every change is approved as you saw it, which isn't so in a workspace that lets small checked changes apply on their own (now "a change that waits for you", and "you decide which changes wait"); "Move projects" claimed a Capsule file is encrypted end to end (back to the accurate wording: transfers between your own devices are); the window's observer read only the first of several entries, so the knight could stay hidden; clicking the open tab replayed its rise; Alt+Arrow (browser Back) switched tabs; and the phone menu's focus trap let Tab escape into the page behind (older than this stage; every step is now moved by hand).
- **The responsive audit** found the window's footer links and the `/chat` pricing link under 44px on touch, a chat bubble counted as a deep inset, and, in the app's phone header from stage 199, the Chat button shrinking on a 320px phone so its touch area covered the search button's. All fixed.

## Verified

- `pnpm typecheck` and `pnpm lint` clean; design, SEO and navigation tests (25 files, 216 tests) pass after the last fixes.
- The full suite: 451 files and 3,651 tests pass. One unhandled error came from `src/agent-runtime/mesh/mesh.test.ts` removing a temp folder while files were still landing (`ENOTEMPTY` on Windows); it's intermittent (two further runs of that file were clean) and that code isn't touched here.
- Production build (demo workspace) succeeds; `/`, `/build`, `/chat` and `/proof` are static.
- `pnpm qa:a11y` on `/`, `/build`, `/chat`, `/proof`, `/survey` and `/app` at 1280 and 375: no findings.
- `pnpm qa:responsive` on the same routes at every phone, tablet and desktop size: no sideways scroll, nothing cut off, nothing out of proportion, no console errors; after the fixes, no small or lost taps (`/` and `/app` re-run at 320, 360, 375 and 844x390 on the final code). The audit can't open the phone menu or the app's search on touch tablets at 1024px and wider, where the header shows its full link row instead; that is the same as before this stage.
- `pnpm qa:vitals` (phone profile, median of three): `/` LCP 2.25 s, TBT 142 ms (before: 2.09 s, 253 ms); `/build` 2.00 s; `/chat` 1.19 s; `/proof` 1.92 s; no layout shift anywhere.
- Looked at in the browser at 1440 and 375: every tab of the window, the phone menu, `/build`, `/chat`, `/proof` and the app's Home with its doors. Keyboard: the menu's trap cycles both ways and returns to the menu button; the window's tabs follow arrows, Home and End and ignore Alt+Arrow.

## Not verified

- A real phone (iPhone or Android): only emulated sizes.
- The knight's peek and the tab rises on a slow phone.
- Without JavaScript the knight stays hidden for people who allow motion (it's decorative; everything else is in the HTML).

## Next

- Watch whether visitors open the space pages from the window and the header.
- A page per space in the app's own help, if people ask for it.
