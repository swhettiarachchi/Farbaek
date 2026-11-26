# Stage 281: Farbaek's own icons

- **Date:** 2026-11-26
- **Branch:** `feat/stage-281-soft-icons`, from `main` after stage 280 was merged (#337)
- **Decision:** ADR 0289 (Farbaek's own icons, one soft and rounded set)
- **Migration:** none. **New dependency:** none. **New paid service:** none.
- **Skills used:** `farbaek-ui` and `farbaek-human-made` (one icon set, an icon names the action, a state is its own drawing); `premium-app-ui` (one family, one stroke, optical weight at small sizes); `ui-ux-pro-max` (icon rules: consistent stroke, no mixed styles, names for readers).

## Why

The owner asked three times on 2026-11-26 for icons like the ones in ChatGPT's phone menu: "smooth, rounded curves and clean, modern outlines rather than sharp, angular, or rigid-looking icons", in one style "across every section and interface of the platform". Stage 279 made every icon bolder. After it went live they wrote: "farbaek still show old style icons". A heavier stroke on the same shapes was not what they asked for: the shapes themselves had square corners.

## What was built

- **A set of 237 icons, drawn for Farbaek** (`src/components/icons/`): each on a 24 unit square, with one 2 unit stroke that has round ends and round joins, and soft corners on every box. Every shape is written by hand as path data to those rules; none is copied from another set.
- **49 of them have a state** (`fills.ts`): the body filled, with its mark cut out. The status pills, notices and "on" controls use these.
- **One component draws them all** (`soft.tsx`), taking the props the app already passed. So 318 files changed one line each, where they import icons from. No screen was rewritten.
- **A small icon is as dark as a large one:** at 16px and under the stroke is a little heavier.
- **The menus read like the reference.** Side by side with the owner's picture the shapes were right and the menu was still lighter than theirs, so in both sidebars a row's icon and words are full ink, and in the phone's drawer a row is 48px with a 24px icon and 16px medium words.
- **Build is three blocks.** Shown the new menu, the owner sent the hammer back alone: "replace another icon to this this not good". Eight drawings were tried as a menu row; three blocks, one set on two, replaced the hammer in the 24 files that drew it. The set has no hammer.
- **Home's three doors** take the icons their rows have in the navigation.
- **The public site's own files are untouched** (the homepage is frozen). Three shared pieces it also shows now draw the set's icons there: the theme switch, the cookie notice and the status pill.
- **Other companies' marks** (GitHub, Apple, Google Play, Windows, Linux) are shown as they come.
- **A fix beside it:** the phone audit's "open the workspace switcher" step pressed a hidden copy of the control and timed out. It presses the one that shows.

## What a person sees

- The menus, buttons, pills, headings and status marks of the whole signed-in product, the staff console and admin, in one soft rounded hand.
- Nothing moved: every icon is where it was, saying what it said.

## Verified

- **Looked at, all of it:** the 237 icons and their states were drawn on sheets at 40, 24, 20, 16 and 14px and read one by one. The globe and the broom were redrawn after the first look; the hammer was redrawn, then replaced.
- **The Build icon in place:** the phone menu, Home's Ask and Build switch and the phone's tab bar were looked at with the blocks, and sent to the owner with the other seven drawings.
- **Beside the owner's reference picture:** the phone menu was put next to it three ways (as it was, larger in ink, larger and heavier). The second was the closest and is what was built. The picture was sent to the owner.
- **In the demo workspace, in a real browser:** Chat with its phone menu open (light and dark), Home, All work, Scheduled, Settings and More, at 390px and 1280px. No console errors on Home, Chat, All work or Approvals.
- **The homepage,** here and live at 1280px: the same picture. The cookie notice's small icon is the one difference.
- **`pnpm qa:responsive --strict`** (before the menu rows were made larger): nine routes at 375 and 1280 in light (20 page views) and five in dark (13 page views): none scroll sideways, cut content off, have small or lost taps, or log errors.
- **Tests:**
  - `tests/design/icon-set.test.ts` (8, new): every file outside the public site takes its icons from the set and none from a library; the public site's own files don't take the set; a component for every drawing and a drawing for every state; every icon is plain path data; one round stroke on a 24 unit square in the colour of the words; heavier when small; a state is its body with its mark cut out through a mask of its own, two on a page never sharing one; the props the app passes.
  - `tests/design/icon-weight.test.ts` (changed): it now finds icons by their import from the set, and still fails on one with no weight or with `regular`.
  - The whole suite: 5,466 passed, 21 skipped (as before), none failed.
- `tsc --noEmit` with a 4 GB heap, and `pnpm lint`: clean.
- **`pnpm build`:** passed, with the 4 GB heap its type check needs on this PC (the first try, without it, ran out of memory in the type check).
- **Not verified:**
  - **Every one of the 318 files on a screen.** The pages above were looked at; the rest changed only where they import from, and are covered by the type check and the build.
  - **The layout audit after the phone drawer's rows grew.** The drawer was looked at; the audit ran before.
  - **The owner's own judgement,** which is the test that counts: whether this is the look they asked for.
  - Production, until it is merged.

## Next

- The owner's look at it live; redraw whatever they point at.
- The desktop app's window, then the iPhone and Android apps, in the same hand.
- The public site takes the set when it is redesigned.
