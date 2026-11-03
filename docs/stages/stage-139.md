# Stage 139: The hero names what Farbaek builds

- **Branch:** `feat/hero-rotating-word`.
- **Migration:** none.
- **ADR:** none.

## 2026-11-03

### Asked

The owner asked for the hero's "From idea to verified software." to also say website and app, nicely.

### Done

- **`src/components/marketing/hero-word.tsx`:** the headline's last word cycles software, website, app, every 2.6 seconds, in signal blue with the full stop in ink. Each word slides up into place (700 ms, the house easing) inside a box sized to the widest word, so nothing around it moves. It pauses while the tab is hidden.
- **Honest:** Farbaek builds websites and apps today (the showroom's web and mobile app samples; apps with a server preview in a sandbox).
- **Accessible:** the h1 carries one steady sentence for screen readers, "From idea to verified software, websites and apps."; the moving part is hidden from them. Under reduced motion it stays on "software.".
- The page title, footer and app manifest keep "software", which covers all three.

### Verified

- `pnpm typecheck`; ESLint on the two files; `vitest` on `tests/design` and `src/components/marketing`: 10 files and 143 tests.
- **A production build in headless Chrome,** at 375px and 1280px: the word goes software, website, app; the heading's height and the paragraph below stay in the same place for all three (95 px and 284 px on the phone, 170 px and 398 px on desktop); no sideways scroll, no errors; "app" keeps its descenders. With reduced motion, it stays on "software." after 6 seconds.
