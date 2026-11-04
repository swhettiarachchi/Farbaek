# ADR 0034: Product films, recorded from Farbaek's interface

- Status: accepted (2026-10-21). How the films are shot changed with ADR 0164 (the studio).
- Replaces part of ADR 0008: the in-browser "concept film" and the illustrated thread on the homepage.

## Context

The homepage showed how Farbaek is meant to work, not the product working:
- **The concept film:** a code-animated story of a hypothetical task ("rewrite 100 product descriptions").
- **The thread:** a static illustration.

The owner asked for cinematic product recordings in the style of Shopify's and Clerion's homepages:
- the primary one directly below the hero;
- real video with captions and controls;
- respect for reduced motion;
- no autoplay with sound;
- mobile first.

Filming the live app doesn't work:
- **It can't run the whole flow.** A real build needs AI keys, a sandbox and money, and the read-only demo can't run it.
- **Screen capture is unsteady.** It's jittery, and can't be repeated after a UI change.

## Decision

Record the films on a **film stage**, frame by frame, from Farbaek's own components with labelled sample data.

### The stage

- **Route:** `/film-stage/[film]`. It returns 404 unless the server runs with `FARBAEK_FILM_STAGE=1`, which production never sets, and it's `noindex`. A test guards both.
- **Deterministic:** every film is a pure function of time `t`, driven by `src/components/films/timeline.ts`:
  - camera keyframes, with the app window resting at a tilt and dollying to the control in use;
  - the cursor, typing, scene dissolves and the scroll of live previews.
- **Real components, used as they are:**
  - the plan card (`ApproveBuild` with the real skills);
  - run events (`EventRow`, `RUN_STEPS`, `RunStatusBadge`);
  - `ScoreRing` and the security check's real labels;
  - `PublishPanel`, the Launch evidence chain and `LiveCheck`;
  - `ProofPackSeal`;
  - a real starter template's files in the preview frame.
- **Labelled:** every frame carries "Sample project, recorded from Farbaek's interface."
- **Honest content:** nothing shown is a capability Farbaek doesn't have. Mesh and provider launches don't appear. The section intro says the waits are shortened.

### The recorder

`pnpm films:record [ids] [--format=…]` runs against a production build started with the flag (the `farbaek-films-prod` launch config). For each film and format it:
1. opens the stage in headless Chrome (`playwright-core`, driving the installed Chrome; it never downloads a browser) with reduced motion emulated, so the product's own CSS animations hold still and only the timeline moves;
2. seeks every frame at 30 fps through `window.__film.seek(ms)`, which waits for preview frames to load and paint, then screenshots it to a temporary folder;
3. encodes with ffmpeg (`@ffmpeg-installer/win32-x64`, an optional dependency with no install script; elsewhere set `FFMPEG_PATH` or put ffmpeg on the PATH): H.264, `-preset slow -tune animation`, yuv420p, `+faststart`, no audio track;
4. re-encodes from the same frames at a higher CRF until the file fits its budget: 6 MB landscape, 5 MB portrait, 1.2 MB per clip;
5. writes the poster frame and the WebVTT captions and chapters, generated from `src/content/films.ts`.

### The films

`src/content/films.ts` is the one source for the stage, the recorder, the player, the captions and the tests.

| Film | Length | Formats |
| --- | --- | --- |
| One build, start to finish | 54 s, six chapters (describe, plan, build, check, publish, live) | landscape 1920×1200 and its own portrait cut, 1080×1350 |
| Proof before anything ships | 32 s, six chapters (review, approve, checks, ProofPack, launch gate, undo) | landscape and portrait |
| Four feature clips (plan, agent, check, live) | 10 s each, looping | 4:3, 1440×1080 |

### The player

`FilmTheater`, `FilmClip` and `FeatureFilms` in `src/components/films/`.

- **Loading:**
  - `<video muted playsInline preload="none">`, so nothing downloads until the film first plays;
  - the poster is server-rendered through the image optimiser, with the portrait poster on phones (`<picture>`);
  - the portrait recording loads below 640px, the landscape one above.
- **Playback:**
  - plays only while at least 45% is on screen and the tab is visible;
  - never starts on its own under reduced motion or Save-Data (the poster shows with a play button);
  - a person's pause stays.
- **Controls:**
  - play and pause, a scrubber segmented by chapter, captions (on by default), and full screen (the whole player, or the video on iPhone, where the captions track shows);
  - all are 44px targets;
  - keys: Space or K, the arrows, J and L for chapters, C and F.
- **Chapters and transcript:**
  - a chapter rail with live progress, where each chapter can be jumped to;
  - "Try it" links to the real thing on the page;
  - a transcript disclosure.
- **Motion:**
  - the stage tilts back and settles flat as it scrolls into view;
  - progress is painted to CSS variables from one frame loop, without re-rendering React every frame.

## Consequences

- **The homepage below the hero:**
  - the build film;
  - the statement;
  - "What it does for you" (the four clips, with a pinned stage on desktop);
  - the showroom;
  - the proof film, which keeps `#how-it-works`;
  - then the existing sections.
- **Removed:** the concept film (`src/components/film/`) and `ThreadSection`. `ProofThread` stays, since the task page uses it.
- **When the UI changes,** the films can go stale. Re-record them:
  1. `pnpm build`;
  2. start `farbaek-films-prod`;
  3. `pnpm films:record` (about 25 minutes on the dev PC);
  4. look at the stills first with `--stills=<ms,…> --out=<folder>`.
- **`tests/design/films.test.ts` keeps them honest.** It checks that every recording exists, fits its budget, starts before it has fully downloaded, and that its captions match the script. Changing a caption in `films.ts` without re-recording fails it.
- The recordings are about 22 MB in the repository. Visitors download only what they play.
