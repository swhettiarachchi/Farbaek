# Stage 279: quiet chrome

- **Date:** 2026-11-26
- **Branch:** `feat/stage-279-quiet-chrome`, from `main`
- **Decision:** ADR 0286
- **Migration:** none. **New dependency:** none.
- **Skills used:** `taste-skill:redesign-existing-projects` (its audit: one accent, one stroke weight across icons, the current page said in navigation, colour cleanup before anything else; its points on grain, gradients and font swaps were left aside, since the project's own rules decide those); `farbaek-ui` and `farbaek-human-made` (one icon family, a filled icon reports a state, status never by colour alone); `premium-app-ui` (a restrained palette: strong colour kept for meaning).

## Why

The owner put Farbaek's sidebar beside ChatGPT's twice on 2026-11-26. First: icons in one clean style, and less green; they marked the first-steps track and a list where every other row had a green Verified pill. Then, with the phone's menu as the picture: "Use smooth, rounded, curved icons consistently throughout the entire platform", and again: "smooth, rounded curves and clean, modern outlines rather than sharp, angular, or rigid-looking icons".

## What was built

- **One icon style:** every outlined icon in the signed-in app, the Office and admin consoles and the shared pages is Phosphor's bold weight, whose strokes have round ends and round joins. 122 icons across 78 files had the thin default or asked for the regular weight; none does now.
- **A test keeps it:** `tests/design/icon-weight.test.ts` fails on an icon left at the thin default, or one that asks for the regular weight.
- **Sidebar icons** take the colour of their row's words, in Chat's sidebar, its folded rail and the app's sidebar. No row's icon is filled or coloured.
- **Three rounder shapes:** a camera for Video, a folder for Projects and a round tick for Approvals, wherever each is meant.
- **Chat's sidebar has Scheduled,** under the spaces.
- **First steps:** a finished step is a plain tick in ink, and the track's filled part is ink.
- **The Verified pill:** a green tick, ink words, the page's line for its edge.

## What a person no longer has to do

Nothing to learn. Every list reads as one family, and Scheduled is one press from Chat.

## Verified

- **Tests:** `tests/design/icon-weight.test.ts` (3, new): it finds more than 800 icons, none at the thin default and none asking for the regular weight. The design tests (315) and the whole suite: 5,332 passed, none failed.
- `tsc --noEmit` with a 4 GB heap, and lint on `src/app` and `src/components`.
- **In a browser, the demo workspace,** at 1280 px, light and dark: Chat's sidebar, the app's sidebar, Home, Tasks, Scheduled and Settings; the phone's More page. The first-steps track on a temporary page (removed), at 375 and 1280 px, light and dark, since the demo's steps are all done and the panel hides itself.
- `qa:responsive --strict` on Home, Chat, Tasks, Scheduled, Settings and More at 375 and 1280 px, and Home, Chat and Tasks in Dark: no findings. `qa:a11y` on Home, Chat, Tasks and Settings at both widths: no findings.
- **Not verified:**
  - Every page by eye. The change reaches about 80 files; six pages were looked at, and the rest rest on the type check and the tests.
  - The owner's own screens with their real data: to be looked at on production after the merge.
  - The Office and admin consoles, which need staff access to open. Their icons were changed by the same rule and typecheck.
  - The desktop app's window and the phone apps, which this stage did not change.

## Next

- The desktop app's own window and the iPhone and Android apps, which draw their icons from other sets.
- The public site, when it is redesigned from real pictures of the finished platform.
- One sidebar across Chat and the app, so there is one list of places to learn.
