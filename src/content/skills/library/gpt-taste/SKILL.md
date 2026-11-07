---
name: gpt-taste
description: Makes the build an award-level, motion-rich site: an AIDA page under a premium nav, a wide hero that never wraps past three lines, gapless bento grids, real GSAP ScrollTrigger pinning, stacking and scrubbing, and huge section spacing. Fits bold landing pages and portfolios.
---
Farbaek edition of "gpt-taste" by Leonxlnx (MIT), https://github.com/Leonxlnx/taste-skill. Shortened to fit a build, with its Python randomisation turned into deliberate layout variation and its CSS filter image effects left out. The full licence is in LICENSE.txt beside this file.

Models wrap headings into 6-line walls in narrow containers, leave dead bento cells, add cheap meta-labels, ship invisible button text and repeat left/right layouts. Break those defaults.

## Vary deliberately
You tend to pick the first option. Choose on purpose instead, never the same UI twice, and write the choice into DESIGN.md:
- 1 hero layout (below)
- 1 type stack: Satoshi, Cabinet Grotesk, Outfit or Geist. Never Inter.
- 3 components from the arsenal
- 2 GSAP paradigms
Then build exactly what you chose.

## Page structure (AIDA)
- Open with a premium nav: a floating glass pill or a minimal split nav.
- Attention: a cinematic, clean, wide hero.
- Interest: a dense, exact bento grid or interactive type.
- Desire: pinned sections, horizontal scroll or text reveals.
- Action: a massive high-contrast CTA and a clean footer.
- Huge padding between sections (py-32 md:py-48): each is a distinct cinematic chapter.

## Hero and the 2-line rule
- Put the H1 in an ultra-wide container (max-w-5xl, max-w-6xl or w-full) so words flow sideways. It never exceeds 2 to 3 lines: shrink the type (clamp(3rem, 5vw, 5.5rem)) and widen the box instead.
- Layouts: Cinematic Center (preferred: centred text, exactly two high-contrast CTAs, a full-bleed image behind with a dark radial wash), Artistic Asymmetry (text left, a floating image overlapping it from the bottom right) or Editorial Split (text left, image right, massive negative space).
- Button text is always legible: dark fill, white text; light fill, dark text.
- Not in the hero: floating stamp or badge icons, pill tags under it, raw stats.

## Gapless bento
- grid-flow-dense on every bento; check that col-span and row-span values interlock: no empty cell or missing corner.
- 3 to 5 intentional cards beat 8 messy ones. Mix large imagery, dense type and CSS effects.

## GSAP motion
No static pages: write real GSAP with ScrollTrigger (a pinned CDN build on static sites, @gsap/react in Next.js).
- Hover: every clickable card and image scales inside overflow-hidden (group-hover:scale-105, duration-700, ease-out).
- Scroll pinning: pin a section title on the left while a gallery scrolls up on the right.
- Image scale and fade: images enter at scale 0.8, grow to 1 in view, then darken and fade to opacity 0.2 as they leave.
- Scrubbed text: the words of a central paragraph scrub from opacity 0.1 to 1 in sequence.
- Card stacking: cards rise from below and stack over each other on scroll.

## Component arsenal
- Inline type images: small pill-shaped images inside a massive headline (inline-block w-24 h-10 rounded-full align-middle bg-cover bg-center mx-2).
- Horizontal accordions: vertical slices that widen on hover to reveal content and imagery.
- Infinite marquee of partners in Phosphor icons or large type.
- Testimonial carousel: overlapping portraits beside minimal quotes, subtle arrows.

## Content and bans
- Meta-labels are banned: "SECTION 01", "QUESTION 05", "ABOUT US".
- Match every image to the vibe and treat it (mix-blend-luminosity, opacity-90) so it doesn't read as stock.
- Ambient backgrounds, never flat colour: deep radial gradients, grainy mesh gradients, shifting dark overlays.
- Wrap the page in main class="overflow-x-hidden w-full max-w-full" so off-screen animation never adds a sideways scrollbar.
- No emoji in code, comments or output.

## Check before code
Verify in the plan before any UI code:
1. The choices above, followed.
2. AIDA: nav, hero, bento, GSAP section and footer all present.
3. The H1's max-w class, so it flows in 2 to 3 lines; no stamps or tag spam.
4. Bento maths: spans fill the grid exactly, grid-flow-dense applied.
5. No meta-labels; button text contrast is right.
