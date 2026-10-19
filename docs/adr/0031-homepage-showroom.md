# 0031. The homepage showroom

- Status: accepted
- Date: 2026-10-19
- Source: the owner's "Create an Exclusive Website & App Inspiration Showcase" brief (19 Oct 2026)

## Context

The homepage explains how Farbaek plans, checks and proves a change. It doesn't show what people can build with it. The owner asked for a showcase below the existing content that makes visitors imagine their own product, with these limits:
- it adds to the homepage and doesn't redesign it;
- each idea has its own look, not one repeated layout;
- mockups are clearly told apart from working demonstrations;
- Farbaek's other capabilities are shown without claiming anything that doesn't exist.

## Decision

**A showroom section after the statement**, before "Every change follows one thread": first what you could build, then how each change is proven. It's `src/components/showcase/`, with its content in `src/content/showcase.ts`. No other section changed.

**Eight concepts, one per category:**

| Concept | Category | Composition |
| --- | --- | --- |
| Typeset Foundry | Websites beyond ordinary | Type specimen with letters that shift weight, and a type tester card |
| Maison Ore | Luxury, reimagined | Editorial store with a bag on a lit plinth, and its product page on a phone |
| Afterglow | Motion meets design | Cinematic site with marquee bulbs, a running film strip and a "Now showing" card |
| Halo One | Immersive by design | Headphones that lean toward the pointer in an orbit ring, with finishes you can try |
| Northlight | Applications of tomorrow | A research app tilted in perspective, with a command bar in front |
| Tally | Apps for every pocket | Two fanned phones (a balance ring, a split bill) and a "settled" notification |
| Kumo | Made to delight | A habit app with a bouncing cloud mascot and floating stickers |
| Orbit Clinic | From idea to product | A clinic's day schedule, the patient's booking phone, and what the one app covers |

Each concept carries a design read in the shape of `DESIGN.md`: a named palette with one accent, type, a signature, and the built-in skills a build like it would use. It also carries the sentence that would start it.

**Drawn in code, not stock images.** No image generator is connected (ADR 0030), so the mockups are HTML and SVG drawn for this page:
- device and browser frames use Farbaek's tokens, with the dark `media` token for phone bezels;
- inside a frame, the concept's own palette is set as `--s-*` variables. This is the one place non-token colours appear, the same way a template's thumbnail shows someone else's colours. ADR 0008 still holds for Farbaek's own interface;
- everything is sized in container units, so a composition scales with the stage like a picture.

**Motion with a purpose:**
- the index is a tablist (arrow keys work), and a marker slides to the chosen concept;
- layers rise in one after another and lean toward a mouse pointer by depth;
- each concept has one loop of its own: the specimen's weights, the bag's sway, the film strip, the orbit, the mascot's bounce;
- loops pause when the stage is off screen, and everything is still under reduced motion.

**Honest labels.** The stage says "Concept mockup", and a note under the showroom says none of these is a live product. The only control inside a mockup is Halo One's finish picker, which really recolours the drawing.

**"Start a build like this"** hands the concept's sentence to the build box at the top of the page (`offerPrompt` in the prompt composer), scrolls to it and focuses it. The visitor can change it, and starting still goes through sign-in, the plan and approval. With no build box on the page, it keeps the sentence and goes to sign-in.

**What Farbaek does around the design** is a spec sheet of ten capabilities, each with a status (icon, label and border pattern, never colour alone):
- the plan, the Studio standard, skills, the steerable agent, checks, approval and proof, and importing or downloading a project: **Working**;
- previews of apps with a server, and publishing: **Working** where the site domain is configured, otherwise **Turning on**. The server works this out from the deployment's configuration;
- image generation: **Not yet**.

Tests keep it honest:
- every skill named exists;
- the "seven built-in skills" line matches the real count;
- image generation stays "not yet";
- palettes have one accent;
- prompts fit the build box;
- there are no em dashes.

## Consequences

- **Weight:** the homepage gains one client component (the showroom) and about 2 KB of keyframes. Only the chosen concept is mounted.
- **Dates:** the status of publishing and previews changes by itself when the site domain is connected and the site is rebuilt.
- **Next:** when image generation exists, concepts could carry generated product photography. Their copy and the capability line change with it.
