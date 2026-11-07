---
name: high-end-visual-design
description: Makes the build feel like an expensive agency site: one chosen vibe and layout archetype, nested double-bezel cards, pill buttons with nested icons, a floating island nav, spring-like motion and very generous whitespace. Fits premium landing pages, portfolios and product sites.
---
Farbaek edition of "high-end-visual-design" by Leonxlnx (MIT), https://github.com/Leonxlnx/taste-skill. Shortened to fit a build, with no filter blur in reveals (Farbaek builds use no CSS filters), readable labels, and first-screen text that never waits for a reveal. The full licence is in LICENSE.txt beside this file.

Engineer $150k agency-level experiences: haptic depth, cinematic spatial rhythm, obsessive micro-interactions, fluid motion, in an Apple-esque, Linear-tier language. Never the same layout or aesthetic twice in a row.

## Absolute zero: any of these fails
- Fonts: Inter, Roboto, Arial, Open Sans, Helvetica. Use Geist, Clash Display or Plus Jakarta Sans.
- Thick-stroked Lucide, FontAwesome or Material Icons. Use ultra-light lines (Phosphor Light, Remix Line).
- Generic 1px solid grey borders; harsh dark shadows (shadow-md, rgba(0,0,0,0.3)).
- Edge-to-edge sticky navbars glued to the top; symmetrical 3-column Bootstrap grids without huge gaps.
- linear or ease-in-out transitions; instant state changes.

## One vibe, one layout
Pick from the brief's context.
Vibes:
1. Ethereal Glass (SaaS, AI, tech): OLED black #050505, radial mesh gradient orbs (subtle purple or emerald), vantablack cards with white/10 hairlines, wide geometric grotesk.
2. Editorial Luxury (lifestyle, real estate, agency): warm cream #FDFBF7, muted sage or deep espresso, high-contrast variable serif headings, film grain at opacity 0.03.
3. Soft Structuralism (consumer, health, portfolio): silver-grey or white, massive bold grotesk, airy floating parts with very soft, diffused ambient shadows.
Layouts:
1. Asymmetrical Bento: varied cells (col-span-8 row-span-2 beside stacked col-span-4). Phone: one column, gap-6, spans reset.
2. Z-Axis Cascade: overlapping physical cards at varied depths, some rotated -2deg or 3deg. Phone: no rotation or overlap (touch conflicts).
3. Editorial Split: massive type on the left half, horizontal image pills or staggered cards on the right. Phone: type on top, content below.
Below 768px asymmetric layouts fall back to w-full, px-4, py-8. Use min-h-[100dvh], never h-screen.

## Double-bezel cards
Never set a premium card, image or container flat on the background: machine it like a glass plate in an aluminium tray.
- Outer shell: bg-black/5 or bg-white/5, ring-1 ring-black/5 or border-white/10, p-1.5 or p-2, rounded-[2rem].
- Inner core: its own background, shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)], concentric rounded-[calc(2rem-0.375rem)].
Use it for all major cards, inputs and feature grids.

## Buttons
- Primary buttons: rounded-full pills, px-6 py-3.
- A trailing arrow never sits naked: nest it in its own circle (w-8 h-8 rounded-full bg-black/5, bg-white/10 on dark) flush with the right padding.
- With group: active:scale-[0.98]; on hover the icon circle shifts diagonally (translate-x-1 -translate-y-[1px]) and scales to 105%.

## Space
- Double normal padding: sections py-24 to py-40.
- Some major headings get a small pill badge above (rounded-full px-3 py-1, at least 12px, uppercase, tracking-[0.2em]). Not every one.

## Motion
- Custom spring-like curves only, such as duration-700 ease-[cubic-bezier(0.32,0.72,0,1)].
- Nav: a floating glass pill off the top (mt-6 mx-auto w-max rounded-full). Hamburger lines rotate into an X (rotate-45, -rotate-45). The menu opens as a screen-filling glass overlay (backdrop-blur-3xl bg-black/80 or bg-white/80); links rise from translate-y-12 opacity-0, staggered 100, 150, 200 ms.
- Below the first screen nothing appears statically: elements fade up heavily from translate-y-16 opacity-0 over 800 ms or more. First-screen text shows at once.

## Guardrails
- backdrop-blur only on fixed or sticky layers (nav, overlays), never on scrolling content.
- Grain only on a fixed, pointer-events-none pseudo-element.
- z-index only for real layers (nav, modals, overlays, tooltips), never z-[9999].

## Order
Archetypes; texture, whitespace and type scale; double bezels; curves, nav and button physics. Then check nothing banned slipped in: it must read as a $150k build, not a template with nice fonts.
