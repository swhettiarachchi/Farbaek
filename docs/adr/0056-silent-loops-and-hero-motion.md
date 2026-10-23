# ADR 0056: Silent loops every browser plays, and a hero that moves on phones

- Status: accepted (2026-10-24).
- Changes ADR 0055 (the Safari-only MP4-in-picture loop). Builds on ADR 0034 (the films), ADR 0051 and ADR 0052 (3D only with a fine pointer).

## Context

After ADR 0055 the owner checked again on an iPhone, in Low Power Mode, in the Google app's incognito browser. Three problems:

**The film still waited behind "Play the film".**
- ADR 0055's loop was an MP4 inside a `<picture>`, which only Safari plays as an image.
- An in-app browser (a WKWebView) may refuse every video without a tap, and may not play an MP4 as an image either.

**The rings around the knight didn't move.**
- Since ADR 0052, the 3D scene only runs with a mouse or trackpad.
- Phones get the static poster, whose orbit is a still SVG.

**The black square** was still in one screenshot. That screenshot was taken within a minute of the ADR 0055 deploy.
- The live CSS now has no `filter` on the homepage.
- The page has no SVG filters.

## Decision

**Silent loops are animated WebP files** (`<film>/<format>-loop.webp`, made by `pnpm films:loops`).
- **Why WebP:**
  - every current browser plays an animated WebP without a tap, including iOS WebKit in Low Power Mode;
  - for screen recordings, WebP stores only what changed between frames, so a loop is about half its MP4.
- **The settings:**

  | Format | Width | Frame rate | Quality |
  | --- | --- | --- | --- |
  | Clips | 640 px | 10 fps | 50 |
  | Portrait films | 480 px | 10 fps | 45 |
  | Landscape films | 720 px | 10 fps | 40 |

- **The sizes:** 0.8 to 1.2 MB for clips, 0.9 and 2.1 MB for the portrait films, 1.6 and 3.7 MB for the landscape ones. Budgets are enforced in `tests/design/films.test.ts`.
- **Caching:** the film manifest hashes the loops, so they're versioned and cached for a year like the recordings.

**When the loop shows:**
- `play()` is refused;
- or nothing has loaded 3 seconds after asking to play (`QUIET_REFUSAL_MS`), for browsers that neither play nor refuse.

If the video starts later, it takes over.

**The loop stays mounted while the film scrolls away,** so it's still moving when it comes back. Browsers don't draw it off screen. A person's pause removes it.

**No play cover over a moving loop:**
- **The big "Play the film" cover** now shows only under reduced motion or Save-Data, or if the loop itself fails to load.
- **The theater's caption line** says "Playing as a silent loop." with a "Play with captions" button.
- **The control bar's button** shows pause while the loop moves, which satisfies WCAG 2.2.2.

**The hero moves on every device:**
- **The knight floats,** and his shadow narrows as he rises. This is CSS.
- **Two lights orbit him on the rings** (SMIL `animateMotion`):
  - the near half of each ring is drawn in front of him;
  - each light has a copy in front that shows only on the near half, so he hides it as it passes behind.
- **Paused off screen:** `data-paused` for the CSS, `pauseAnimations()` for SMIL, called only on a real change.
- **Still under reduced motion.**
- **Desktops with a mouse** still cross-fade to the 3D scene.
- **A Chrome quirk:** Chrome stops redrawing an SVG whose only animations are `animateMotion`. Each light carries an `<animate>` element, which keeps both layers ticking in step.

## Amendment (2026-10-24): the Loom on every screen

The owner asked for the desktop 3D scene's look on phones:
- a tilted ring with the six stage nodes (three blue, one amber, two grey);
- evidence packets travelling the thread;
- motes rising round the knight.

The two lights above were replaced by the Loom itself, drawn in 2D:

- **One geometry:** `loom-geometry.ts` holds the Loom's shape, colours and speeds as plain numbers. The 3D scene (`loom-scene.tsx`) now reads them too, so the two can't drift.
- **Checked against three.js:**
  - `toWorld` matches the 3D groups' transforms exactly;
  - `project` matches the 3D camera;
  - the stages sit at even lengths round the ring, like the 3D curve's `getPointAt`.
- **`LoomCanvas`:**
  - draws each frame on two canvases either side of the knight: the far half behind, the near half over him;
  - motes are sized as three.js sizes points, by screen height;
  - on screens under 1024 px the rings sit at 78% of their size, so the stages stay on screen;
  - it starts once the browser is idle and stops off screen;
  - under reduced motion it draws one still frame;
  - it fades out when the 3D scene takes over on desktops with a mouse.
- **Cost:** a few hundred canvas calls a frame and no 3D library. On a 4× slower CPU it holds 60 frames a second, with the slowest frame at 17 ms.

## Consequences

- **Low Power Mode and restrictive in-app browsers** download a loop instead of the MP4: about half the bytes for portrait films.
- **The repository carries 12 MB of loops.** `pnpm films:loops` must run after `pnpm films:record`; the manifest test fails if a loop is stale or missing.
- **The loops are 10 fps,** smoother than a poster but not as smooth as the video. A tap gives the full film.
- **Not verified here:** the owner's iPhone in Low Power Mode. Headless Chrome with `play()` refused shows each loop loading and moving, and no MP4 request.
