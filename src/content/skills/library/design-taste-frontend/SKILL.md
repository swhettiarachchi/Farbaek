---
name: design-taste-frontend
description: Makes the build read the brief before choosing a direction or a real design system, then hold landing pages, portfolios and redesigns to strict anti-template rules for heroes, eyebrows, CTAs, palettes, bento grids and motion. Fits marketing sites, not dashboards.
---
Farbaek edition of "design-taste-frontend" by Leonxlnx (MIT), https://github.com/Leonxlnx/taste-skill. Shortened to fit a build, and its settings dials are folded into choices made from the brief. The full licence is in LICENSE.txt beside this file.

## Read the brief
- Quiet constraints (public sector, regulated, kids) beat taste; the audience picks the aesthetic.
- Design read: "Reading this as: <page kind> for <audience>, with a <vibe> language, leaning toward <system or aesthetic>." If it truly splits, take the likelier reading and say so in DESIGN.md.
- Calm or editorial: near-symmetry, light motion, py-32 to py-48. Agency: asymmetry, choreographed scroll. Trust-first: plain and still.
- If the brief maps to a real system, use its official package, one per project: Fluent, Material Web, Carbon, Primer, GOV.UK Frontend, USWDS, Bootstrap 5.3, Radix Themes, or shadcn/ui (never in default state).

## Type, colour, icons
- Sans display by default (Geist, Satoshi, Cabinet Grotesk, Outfit). "Creative means serif" is a top AI tell: serif only when the brand names one or is truly editorial, luxury or heritage and you can say why. Rotate serifs.
- Emphasis is italic or bold of the same family. Italic display words with y g j p q need leading-[1.1] and pb-1.
- One accent, under 80% saturation, locked on every section. No purple glow by default.
- Premium consumer: never default to cream (#f5f1ea), brass, clay or oxblood (#b08947) and espresso text (#1a1714). Rotate: cold luxury, forest and amber, black and tan, cobalt and cream, terracotta and slate, olive and brick, mono plus one pop.
- No pure #000 or #fff, neon glows or custom cursors.
- Icons: Phosphor, Hugeicons, Radix or Tabler; never hand-drawn paths.

## Layout
- Hero: top padding at most pt-24; at most 4 text elements (eyebrow or brand strip, headline, subtext, CTAs: 1 primary, 1 secondary). No tagline under CTAs, trust strip, pricing teaser, bullets or avatar row. Logo walls go under it: logos only, no category labels.
- Nav on one line at desktop, 64 to 72px tall, 80px max.
- At most 1 eyebrow per 3 sections, hero included. No split header (big headline left, small paragraph right) unless the right holds a visual.
- A bento has exactly as many cells as items; 2 or 3 carry an image, gradient, pattern or tint.
- Per section: headline up to 8 words, paragraph up to 25. Lists over 5 items become columns, image cards, tabs, scroll-snap pills or a carousel; spec sheets become cards or chunks, never a hairline per row.
- CTAs: one line, 3 words max, one label per intent ("Contact us" and "Let's talk" never both).
- Quotes: 3 lines max, name and role.
- Cards only when elevation shows hierarchy; else border-t, divide-y or space. Tint shadows to the background.

## Tells to cut
Hero version labels (BETA), "No. 01" meta, "01 / 4" counters, scroll cues, more than one · per line, decorative status dots, br-split italic headlines, rotated text, decorative grid lines, version footers, poetic labels ("Field notes", "Quietly trusted by"), locale or weather strips, sentences under eyebrows, "Step 1" labels, pills on photos, decorative photo credits, hero-bottom word strips, progress bars with tracks, 99.99%.

## Motion
- Motion promised is motion shipped; otherwise ship a clean still page.
- One marquee a page at most. Sticky stacks and horizontal pans pin at start "top top"; a pan ends at "+=" its overflow, scrub 1; a stacked card shrinks (scale 0.92, opacity 0.55) as the next arrives.
- Plain reveals use whileInView or IntersectionObserver; GSAP is for pin and scrub. Never GSAP or Three.js with Motion in one tree. Springs (stiffness 100, damping 20), not linear.
- Next.js: motion in "use client" leaves, motion values, not useState, for pointer and scroll; min-h-[100dvh], not h-screen.

## Redesigns
Preserve or overhaul: follow the plan, and preserve when it doesn't say. Audit tokens, IA, SEO and analytics first; keep slugs, nav labels, form fields, logo and legal copy. Levers in order: type, spacing, colour, motion, hero, blocks.
