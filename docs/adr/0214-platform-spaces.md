# ADR 0214: Four spaces, and a homepage that opens onto them

- **Status:** accepted (stage 200, 2026-11-16)
- **Builds on:** ADR 0008 (White Signal), ADR 0049 (small text), ADR 0052 (phone performance), ADR 0153 (plain icons), ADR 0172 (motion), ADR 0180 and 0183 (human-made UI), ADR 0211 (sized phone first), ADR 0213 (Farbaek Chat)
- **Changes:** the public site's structure and navigation; the homepage; adds `/build`, `/chat` and `/proof`; promotes Survey Studio in the app's sidebar

## Context

The homepage had grown to thirteen sections: the hero, three films, a statement, the showroom, Survey Studio, an approval demo, eight modules, proof, what works today, pricing and questions. Everything Farbaek does was on one page, and the header pointed into it with anchors. Survey Studio was the only part with a page of its own, and Farbaek Chat, the newest part, wasn't on the public site at all.

The owner asked for a complete rethink of the homepage, and for each feature to have its own dedicated interface, the way ChatGPT, Claude and Google Antigravity give each product its own surface, while the platform still feels like one place. We studied the three: ChatGPT's overview leads with one sentence and a product window that changes with it, then a sticky tour and a rail of use cases; Antigravity gives each surface (app, command line, editor) a large panel and a short paragraph; Claude frames the product around the jobs you hand it. All three are calm, light, typographic and generous with space, and none puts everything on its first page.

## Decision

**Four spaces.** Farbaek's work is grouped into four spaces, each with its own public page and its own place in the app:

| Space | What it is | Public page | In the app |
| --- | --- | --- | --- |
| Build | Describe a site or app; the agent plans, builds and checks it, and waits for your approval. Studio, templates, test spaces, launch, the desktop app | `/build` | `/app/new`, `/app/build`, `/app/projects` |
| Chat | Ask, write, code and make pictures with your files, in a private chat | `/chat` | `/app/chat` |
| Survey Studio | Land survey plans from field data, drawn to scale as PDF and DXF | `/survey` | `/app/survey` |
| Proof | Approvals bound to exactly what you saw, checks that really ran, ProofPacks anyone can verify | `/proof` | `/app/approvals` |

One list (`src/components/site/spaces.ts`) names them, with their icons, pages and one-line promises, and every place that shows them reads it: the header, the phone menu, the footer, the homepage and the app.

**A homepage that opens onto the spaces.** The homepage now does three jobs, in order: say what Farbaek is, show each space, and show that it's real. Its sections:

1. **The hero:** one line ("Vibe coding you can prove.", keeping the search phrase stage 186 chose), the build box, and the platform window: four tabs, one per space, each showing a glimpse of that space's interface drawn from tokens, with a link to its page and to the app. The cat knight watches from the window's corner. Tabs are a real tab list (arrow keys, Home and End); nothing advances by itself.
2. **The build film:** the recorded build, unchanged.
3. **The statement:** every change planned, checked, approved and proven, with the stage arc.
4. **Start with something you need:** a rail of jobs, each tagged with its space, labelled samples.
5. **Built in, not bolted on:** approvals, security tests and ProofPack checks, each linking to the page that proves it.
6. Pricing, questions, and a last call to start.

The showroom, the feature clips and "everything around the build" move to `/build`; the proof film, the approval demo, the ProofPack and "what works today" move to `/proof`. Film chapters can now link to a place on another page (`/proof#evidence`).

**Each space page has its own shape.** `/build` keeps the Loom and the knight from the old hero, beside the build box. `/chat` is laid out like a conversation: a chat window in light and dark, what it can do, and how private it is. `/proof` leads with the Seal. `/survey` stays as it was.

**Navigation names the spaces.** The header lists Build, Chat, Survey Studio, Proof and Pricing, with the current page marked; the phone menu shows each space as a card with its promise; the footer groups spaces, resources and contact. In the app, Survey Studio joins the main list in the sidebar (it was folded into Tools), and Home gets a row of doors into each space.

## Consequences

- Five public pages to keep in step instead of one; `spaces.ts` keeps their names and promises in one place.
- The homepage is lighter: fewer sections, no 3D scene, and a text headline as the largest paint.
- `/chat` shows Chat in its dark look beside the light one, using the real night tokens inside a `.chat-root` frame: a picture of a choice Chat offers, not a dark section (White Signal stays the site's one theme).
- Search: `/build`, `/chat` and `/proof` join the sitemap. The homepage's title and description are unchanged.
- Everything shown as an interface is drawn from tokens and labelled sample where it shows work; nothing claims a feature, model or number that isn't real (pictures need Farbaek's Gemini key, OpenAI answers need its key, and the pages say "where available" rather than promising them).
