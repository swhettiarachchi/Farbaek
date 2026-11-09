---
name: farbaek-human-made
description: "Farbaek's permanent standard that nothing it shows, and nothing it builds for people, may look AI-made (ADR 0180). Use this whenever you add or change anything people see in the Farbaek repo (src/app, src/components, the films, the desktop renderer, the iPhone app), anything the build agent is told to produce (the Studio standard, review_site, the built-in skills), or any status, chip, badge, icon, number, counter or small label, even if the task only says 'add a badge', 'show the status' or 'make it look better'. It says which tells give an interface away, what to show instead, and how tests/design/human-made.test.ts enforces it."
---

# Human-made, not generated

People can tell when an interface was generated. Not from one thing, but from a texture: a glyph on every chip, a monospace word where a name belongs, a coloured dot before each line, a counter that reads 0:00, a strip of tiny pills carrying numbers nobody asked for. Each is small. Together they say nobody decided anything.

Products made by large teams have the opposite texture. Status is a word with its own icon, colour and border, the same everywhere. Numbers appear only when they mean something, in a sentence, with a label. Icons come from one set, at a few sizes, and each names a thing or an action. Small text is calm Geist in sentence case. This skill holds that standard for Farbaek's own screens and for every site and app Farbaek builds, so nobody can tell Farbaek was used.

Read `CLAUDE.md` first, then `farbaek-ui` for the system. This skill is the layer on top: the tells, and what replaces them.

## The tells, and what to show instead

| Tell | Why it reads as generated | Show instead |
| --- | --- | --- |
| A stock glyph on a status chip (hourglass, flask, fingerprint), or some chips with icons and others blank | Generated UI picks a picture per state, or leaves the work half done | Every status is one of `StatusBadge`'s thirteen kinds (ADR 0183): its words, a precise filled icon (check, clock, person clock, warning circle, pause, cross, prohibit, dashed circle, minus), its colour and its border. Never a blank where an icon belongs |
| An hourglass for waiting, a flask for a test, a fingerprint for approval | Stock metaphors chosen by the glyph library, not the product | Say who it waits for ("Waiting for you", "Waiting for DNS"). Trials and practice say "Sample" in words. Approve buttons use a check, the action itself |
| Monospace for words (a model id, a tool name, a state) | Mono says "machine", and a person doesn't copy a model's name | Mono only for data people copy or compare: hashes, paths, commands, addresses, keys. Models get their product name (`modelName()`), tools their verb, states their word |
| A coloured dot before a line | A dot is decoration dressed as status | The kind's icon (`StatusGlyph`) beside the words. One exception: an unread marker, as in every mail app |
| A counter with nothing to count (0:00 before a film starts, "Steps 1") | Numbers that only exist to look like a dashboard | Numbers only when real and useful, in a sentence with a label, in tabular Geist. A film shows its length until it plays |
| A strip of pills under a heading (Steps, model, usage, cap) | A metadata bar, not a thought | One or two plain sentences: "Step 7 of a Balanced run on Claude Haiku 5.5. Used 2% of this month's AI usage, with a cap of 8%." |
| A sentence squeezed into a chip with an icon ("1 change no line of the plan explains") | Chips are for one or two words | Facts are lines in a list, written as a person would say them |
| Eyebrows, tracked capitals, `//` labels, numbered sections, version stamps, scroll cues, city-and-time strips | The templated rhythm of generated pages | Headlines stand alone (ADR 0049). Sections aren't numbered. Nothing is stamped BETA. Nobody is told to scroll |
| Fake-precise or round-perfect numbers (99.99%, 4.1x, 48k) | Invented engineering precision | Real numbers, or sample ones labelled sample |
| Sparkles, robots, wands, brains, rockets, circuits, lightning as decoration | The stock picture of "AI" | An icon that names the action: hammer to build, pen nib to draft, play to try (ADR 0153) |
| `#000`, `#fff`, neon glows, purple-blue gradients, gradient headlines, three equal cards, glass on everything | The defaults a model reaches for | Tokens only, one accent, soft tinted depth, varied layouts (ADR 0008, ADR 0156) |
| An em dash anywhere in visible text | The single most recognised tell | A comma, a colon, a full stop or parentheses |

## Where the rules live in code

- **`StatusBadge`** (`src/components/ui/status-badge.tsx`): the one way to draw a status, as one of thirteen kinds; `StatusGlyph` draws a kind's icon alone in rows and step lists. Map a new state to a kind; never draw a pill by hand. Blue (`approval`) is your turn, burnt orange (`caution`) a real warning, steel (`info`) information or work in progress. No gold, amber or purple.
- **`CardTitle`** (`src/components/app/primitives.tsx`): every section heading in the app, with a 20px outlined icon in the quiet ink. The same concept gets the same icon on every page.
- **`modelName(id)`** (`src/core/billing/rate-card.ts`): the only way a model is shown.
- **Facts and counts** are sentences in `text-sm text-ink-2`, numbers in `tabular font-medium text-ink`.
- **Lists** use real bullets (`list-disc`) or none, never a drawn dot.
- **The Studio standard** (`src/core/agent/studio-standard.ts`) carries the same tells for what the agent builds, and **`review_site`** (`src/core/agent/site-review.ts`) flags the ones a scan can find: scroll cues, version stamps, numbered sections, "Quietly trusted by", city-and-time strips, too many uppercase labels, decorative dots.

## How it's checked

`tests/design/human-made.test.ts` fails on: hourglass, flask, test tube, fingerprint, circuitry and lightning icons on the web and in the desktop app; the hourglass symbol in the iPhone app; drawn status dots; monospace on a model; a literal `0:00`. It sits beside `type-tells` (small text), `plain-icons` (AI tropes), `plain-words` (jargon) and `no-filters`.

A scan can't judge everything. Before calling a screen done, look at it at 375 px and 1280 px and ask one question of every small element: would a designer at a large company have put this here, in this form? If it's a chip, could it be a word? If it's a number, does anyone need it? If it's an icon, does it name the action? If it's mono, would someone copy it?

## For what Farbaek builds

The same standard reaches people's sites and apps through the Studio standard and the built-in skills. When you change what the agent is told, keep the two lists in step: a tell banned here is banned there, in the same words, so a site Farbaek builds reads as made by its own brand's team.
