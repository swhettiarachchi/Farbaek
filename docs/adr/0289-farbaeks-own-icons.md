# ADR 0289: Farbaek's own icons, one soft and rounded set

- **Status:** accepted (stage 281, the Farbaek program, 2026-11-26)
- **Builds on:** ADR 0153 (an icon names the action), ADR 0183 (one icon set; a filled icon is a state), ADR 0286 (one rounded style).
- **Replaces:** the part of ADR 0286 that made the rounded style "Phosphor at its bold weight". The rest of ADR 0286 stands.
- **Changes:** where every screen outside the public site takes its icons from, and what they look like. No migration, no new dependency, no paid service.

## Context

The owner asked three times on 2026-11-26 for "smooth, rounded, curved icons" across the platform, "following the same visual style as the icons shown in the reference image" (the menu of ChatGPT's phone app), with "clean, modern outlines rather than sharp, angular, or rigid-looking icons", in one style "across every section and interface".

Stage 279 answered by drawing every Phosphor icon at its bold weight. It went live and the owner wrote: "farbaek still show old style icons". They were right. A heavier stroke is the same drawing: Phosphor's boxes have corners of under one pixel at the sizes the app uses, its folder and its picture frame are square, and no weight changes that. The reference's icons are a different drawing: boxes with large soft corners, one even stroke with round ends, shapes reduced to what names the thing.

No icon library in the project draws that way, and a new dependency would bring its own shapes and its own limits. The reference's icons are another company's work and are not to be copied.

## Decision

**Farbaek draws its own icons: one set, soft and rounded, for every screen outside the public site.**

### The drawing rules

- **A 24 unit square.** What is drawn sits inside it with a unit or two of air.
- **One stroke,** 2 units wide, with round ends and round joins. Drawn at 16px or under it is 2.3 units, so a small icon is as dark as a large one.
- **Soft corners on every box:** about 5 units on a frame that fills the square, less on a smaller one. No box in the set has a square corner.
- **Circles are circles.** The round marks a state is said with share one ring.
- **As few parts as name the thing.** A picture is a frame, a sun and a hill. A folder is one closed shape.
- **The colour of the words beside it** (`currentColor`): an icon has no colour of its own.
- **A state is the icon's body filled, with its mark cut out** (`weight="fill"`): a tick in a disc, an exclamation mark in a triangle. An icon with no state drawn stays an outline.
- **Every shape is Farbaek's own drawing,** written as path data by hand to these rules. None is traced or copied from another set. The marks of other companies (GitHub, Apple, Google Play, Windows, Linux) are theirs and are shown as they come.

### Where it lives

- **`src/components/icons/`**: `shape.ts` holds the geometry (a box with soft corners, a ring, the shared frames), `paths-a.ts`, `paths-b.ts` and `paths-c.ts` hold 237 icons as path data, `fills.ts` the 49 that have a state, `soft.tsx` the one component that draws them, and `index.ts` a named export for each.
- **A component takes the props the app already passed** (`size`, `weight`, `className`, `aria-hidden`, `alt`, `mirrored`, `color`) and keeps each icon's name. So a screen changed its icons by changing one line, where it imports them from: 318 files, no screen rewritten.
- **They hold no state and read no context,** so they draw the same in a Server Component and in the browser.
- **They are smaller to send.** The old library kept six weights of every icon; the set keeps one drawing, and a second only where a state needs it.

### In the menus

Side by side with the reference, the shapes were right and the menu still read as lighter: its icons were grey and small beside small words. So in the two sidebars:

- **A row's icon and its words are full ink,** whether or not it is the page you are on. The page you are on has the white pill, as before.
- **In the phone's drawer a row is 48px tall, its icon 24px and its words 16px, medium.** On a desktop the rows keep their 20px icons and 14px words.
- **The More page's list** draws its icons at 24px in ink.

### Build is three blocks

The first set kept the hammer for Build (ADR 0153). Shown the menu, the owner sent the hammer back alone: "replace another icon to this this not good". A hammer is a thin diagonal thing among soft boxes, and reads badly at 20px however it is drawn.

- **Build, and the agent building, is three blocks, one set on two** (`BlocksIcon`): boxes like the rest of the menu, and it still names the action.
- It replaces the hammer everywhere in the app (24 files). The set has no hammer. The public site's own files keep theirs until the site is redesigned.

### What takes the set, and what doesn't

- **Every file outside the public site's own folders** takes its icons from the set and from nowhere else (`tests/design/icon-set.test.ts`).
- **The public site's own files are untouched** (`src/app/(site)`, `src/components/site`, `marketing`, `films`, `three`): the owner has frozen the homepage until the platform is done. Three small shared pieces the homepage also shows now draw the set's icons there too: the theme switch, the cookie notice and the status pill.
- **Home's three doors** (Chat, Images, Video) take the icons their rows have in the app's navigation, not the public site's.
- **`weight="bold"` is still written at every icon** (ADR 0286's test stands). The set draws one outline whatever weight is asked for, and a state for `fill`.

## Consequences

- The whole signed-in product, the staff console and admin are drawn in one hand: menus, buttons, pills, headings, status.
- **A new icon is drawn, not picked.** It costs a few minutes and a look at the sheet, and it will match. `index.ts` says how.
- **Status pills changed slightly** everywhere, the homepage's samples included: the same discs and marks, drawn by the set.
- **Not yet:**
  - the desktop app's own window, the iPhone app (SF Symbols) and the Android app still have their icons;
  - the public site, which is redesigned last;
  - sites and apps Farbaek builds for people keep their own icon rules (the Studio standard);
  - a few rare icons (the broom, the waving hand) are plain rather than good, and are worth another pass.

## Verified

See `docs/stages/stage-281.md`.
