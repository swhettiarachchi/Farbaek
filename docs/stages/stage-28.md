# Stage 28: Films that keep moving, and the iPhone black square

The owner checked the live homepage on an iPhone and reported two problems:
- a black square behind the header;
- films waiting for a tap.

They asked for the homepage films to play like animation: always on, always looping.

- **Decision record:** `docs/adr/0055-always-moving-films-no-filters.md`.
- **Branch:** `feat/always-on-films`, from `main` after #34.

## 2026-10-24

### Done

**The black square:**
- It's WebKit bug 314999: on iOS 26, a filter on an element below the fold paints a black square at the top left of the screen.
- Its size matched: about 75 CSS pixels for the aurora's `blur(28px)`.
- **The aurora** is now drawn with `closest-side` gradients from the accent tokens, with no filter.
- **Other filters removed:**
  - the Halo One headphones' drop-shadow is now a gradient contact shadow;
  - the accent button and sandbox console hovers use colour instead of `brightness()`;
  - so does the blog starter template.
- **`tests/design/no-filters.test.ts`** keeps filters out of `src/app` and `src/components`. The recording-only film stage is exempt.

**Films:**
- **Every film in sight plays and loops.** `pickLead` (one at a time) is removed, and a film starts once 20% of it is on screen.
- **`SilentLoop`:** where the browser refuses to start a film (iOS Low Power Mode), the same MP4 runs as a silent animated image through a `<picture>` `video/mp4` source. Safari plays it like a GIF; other browsers skip it without downloading.
- **The theater in loop mode** says it's a silent loop and offers "Play with captions". The clip's button pauses the loop.
- **A refused autoplay no longer turns into "slow"** after ten seconds. Clips used to swap their play button for "Try again".

### Verified

- **Diagnosis:**
  - the owner's screenshot measures 75 by 75 CSS pixels at the viewport's top-left;
  - on the live page, `elementsFromPoint` there finds only the header;
  - the only filters on the homepage were the aurora (six panels below the fold) and the headphones.
- **Homepage scroll on the demo production build** (headless Chrome):
  - **Phone, 393 px:** up to two films play at once, every film plays when in sight, and nothing logs an error.
  - **Phone with `play()` refused** (NotAllowedError, as Low Power Mode does): the loop layer mounts for each film in sight, Chrome makes no MP4 request at all, and the play cover and clip buttons stay.
  - **Desktop, 1280 px:** films play in sight and rest off screen.
- **Screenshots:** the aurora at 1280 and 393 px (soft, no edges) and the Halo One contact shadow.
- **Audits:**
  - `pnpm qa:responsive` at 320, 375, 414, 768, 1024 and 1440 px: 180 page views, no sideways scroll, cut-off content, small targets or errors;
  - `pnpm qa:a11y`: 60 page views, no findings.
- **Checks:** `pnpm typecheck` and `pnpm lint` are clean; `pnpm test`: 1,314 passed, 14 skipped.

### Not verified

- **Safari on an iPhone in Low Power Mode,** where the silent loop can only be seen. The owner's phone is the check.
- **That the black square is gone on the owner's phone.**

### Next

- The owner opens the homepage on the iPhone in Low Power Mode after the deploy. The films should move, and the header should have no square.
- If Safari doesn't play the loop, fall back to animated AVIF previews generated from the clips.
