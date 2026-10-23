# ADR 0051: Film playback that holds up on phones

- Status: accepted (2026-10-23). One video at a time (`pickLead`) was replaced by ADR 0055: every film in sight plays.
- Builds on ADR 0034 (product films) and ADR 0008 (White Signal).

## Context

The owner reported that the homepage films sometimes get stuck, don't play or display wrongly on phones.

**What was checked first and found sound:**
- **The recordings:** H.264 High profile, yuv420p, with the index at the front (faststart), within budget.
- **The server:** production answers byte-range requests with 206 and `Accept-Ranges`, and serves `video/mp4`. iPhone Safari needs both.
- **A resumed range request** with the weak ETag still gets a 206.

**The player code had the problems.** Seven causes, each able to leave a film stuck or wrong on a phone:

| # | Cause | What it did |
| --- | --- | --- |
| 1 | The video was hidden (opacity 0) until its first frame, with the poster underneath | Phone browsers may not start or keep playing a muted video they consider invisible. The video then never draws the frame that would reveal it. |
| 2 | The play/pause button and the "Loading" pill showed what the player *wanted*, not what the video *did* | The feature clips threw away every `play()` refusal. In Low Power Mode, a clip showed a Pause button over a frozen poster. |
| 3 | Nothing handled a stalled network, an interrupted `play()` (AbortError) or a page restored from the back-forward cache | "Loading the film" could stay forever, and a film paused by the browser stayed paused while the player thought it played. |
| 4 | Several videos could play at once | Phones also mounted the hidden desktop stage's four clips, ten video elements in all. |
| 5 | The film stage tilts with a scroll-linked 3D transform, wrapping the playing video | On phones that costs a frame budget on every scroll, and WebKit can leave video inside 3D transforms unpainted. |
| 6 | A blurred aurora behind each film animated forever, and `backdrop-blur` controls sat on top of the playing video | Constant GPU work on low-end phones. |
| 7 | Recordings were served with `max-age=0` | Every visit revalidated every range. |

## Decision

**One playback layer, for both players** (`use-playback.ts`, decisions in `player-logic.ts`):
- **`useVideoControl`** keeps the element in step with what the player wants, and reports what the element is really doing (playing, frame shown, blocked, slow, failed), per source.
  - **Every `play()` refusal is read (`playFailure`):**
    - NotAllowedError means "blocked": a play button shows, and the press calls `play()` inside the gesture;
    - AbortError means "interrupted": it's tried again on `canplay`, `pageshow` and `visibilitychange`;
    - anything else with a media error means "failed".
  - **A stall:** ten seconds without a frame (`SLOW_AFTER_MS`) shows "This is taking longer than usual" with Try again. Clips turn their button into Try again.
  - **A failure** shows the poster again, with Try again. The film also offers "Read what happens".
- **The poster sits above the video, which stays at full opacity,** and fades away once a frame is drawn.
- **One video at a time (`pickLead`):** of the videos that may play, the one the person started most recently wins. Otherwise it's the one with the most pixels on screen. Others pause.

**Lighter on phones:**
- **The tilt** runs only on large screens with a mouse: `(min-width: 1024px) and (hover: hover) and (pointer: fine)`.
- **The aurora** breathes only there too.
- **Overlays** on a playing video are solid, with no backdrop blur.
- **Feature clips:** only the layout on screen mounts its videos, so phones have six video elements, not ten.

**Versioned recordings:**
- **The manifest:** `scripts/films/manifest.mjs` writes a 12-character content hash for every recording and caption track to `src/content/films-manifest.json`. `pnpm films:record` runs it.
- **The URLs:** the players request `?v=<hash>`.
- **Caching:** `next.config.ts` caches versioned requests for a year (`immutable`), and unversioned ones keep the default.
- **Posters** stay unversioned, because they go through the image optimiser.
- **A test** fails if the manifest doesn't match the files.

**A responsive audit** (`pnpm qa:responsive`) opens every route at 320 to 1440 pixels as a phone, tablet or desktop in headless Chrome. It reports:
- sideways scroll;
- cut-off content;
- small touch targets;
- console errors.

## Consequences

- **Verified in an emulated phone (Chromium):**
  - a refused autoplay;
  - a press that plays;
  - a ten-second stall with Try again;
  - a page restored after the browser paused the film;
  - a failed recording and its retry;
  - one video at a time across the theater and the clips.
- **Not verified:** real iPhone Safari and Android hardware weren't available. Causes 1 and 5 are WebKit behaviours this design avoids rather than reproduced bugs.
- **Phone renditions of the clips** (1440×1080 today) would save about half their size. They're left for later: the clips are 0.9 to 1.1 MB, and Save-Data already stops autoplay.
