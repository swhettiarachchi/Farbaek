# Stage 24: Films that play on phones, and a responsive audit

The owner reported that the homepage films sometimes get stuck or don't play on phones, and asked for the whole platform to work at every screen size.

This stage does three things:
- finds the root causes and fixes them in one shared playback layer;
- builds an audit that opens every route at eleven widths;
- fixes what that audit found.

- **Decision record:** `docs/adr/0051-film-playback-on-phones.md`.
- **Branch:** `feat/mobile-video-reliability`, from `main` after #30.
- **Plan mode:** the stage started without it. The owner asked for implementation without per-step approval; this file is the record.

## 2026-10-23

### Done

**Ruled out first:**
- **The recordings** are H.264 High, yuv420p and faststart.
- **Production** answers range requests with 206 and serves `video/mp4`.
- **A resumed range request** with the weak ETag still gets a 206.

**Root causes found in the players:**
1. **The video was hidden at opacity 0 until its first frame.** Phones may not start a video they consider invisible.
2. **The controls showed intent, not what the video was doing.** The clips threw away every `play()` refusal, so Low Power Mode showed Pause over a frozen poster.
3. **No recovery** from a stall, an interrupted `play()` or a page restored from the back-forward cache.
4. **Several videos could play at once,** and phones mounted ten video elements, four of them for the hidden desktop stage.
5. **A scroll-linked 3D tilt** wrapped the playing video.
6. **An endlessly animated blur** sat behind it, and `backdrop-blur` controls sat on top of it.
7. **`max-age=0` caching.**

**Fixes:**
- **One playback layer** (`use-playback.ts`, `player-logic.ts`) for `FilmTheater` and `FilmClip`:
  - **`useVideoControl`** reads every refusal:
    - a refused autoplay shows a play button that plays inside the tap;
    - an interruption retries on `canplay`, `pageshow` and `visibilitychange`;
    - ten seconds without a frame shows "This is taking longer than usual" with Try again;
    - a failure shows the poster again, with Try again.
  - **The poster** now sits above a fully visible video and fades away.
  - **`pickLead`** lets one video play at a time: the one the person started most recently, otherwise the one with the most of itself on screen.
- **Effects on phones:**
  - the tilt and the breathing aurora run only on large screens with a mouse;
  - overlays on a playing video are solid;
  - the feature section mounts only the clips for the layout on screen (six video elements on phones, down from ten).
- **Versioned recordings:**
  - `scripts/films/manifest.mjs` writes content hashes to `src/content/films-manifest.json` (`pnpm films:record` runs it);
  - the players request `?v=<hash>`;
  - `next.config.ts` caches versioned requests for a year (`immutable`);
  - a test fails if the manifest is stale.

**The responsive audit, `pnpm qa:responsive`** (`scripts/qa/responsive-audit.mjs`):
- **Coverage:** every route, plus dynamic ones found from their list pages, at 320, 360, 375, 390, 414, 430, 600, 768, 1024, 1280 and 1440 pixels.
- **Emulation:** headless Chrome as a phone (below 768), a tablet (below 1024, touch) or a desktop.
- **Reports:**
  - sideways scroll;
  - cut-off text or controls;
  - touch targets under 44 by 44 (links inside running text are exempt, and a label or pseudo-element tap area counts);
  - console errors.

**What the audit found, all fixed:**
- **A hydration error (React #418) on the homepage under reduced motion,** which production has too. `StatementSection` rendered the sentence as words on the server and as one string on the client. It now renders the same words, and CSS holds them at full ink.
- **`/app`, `/app/build` and `/app/new` scrolled 4 to 5px sideways** at 768 and 1440. The cause was the aurora glow. The app, admin and Office Space shells now clip sideways overflow on `<main>` (`overflow-x-clip`, as the marketing layout already did; sticky still works).
- **Project and template thumbnails logged "Blocked script execution".** Their documents now leave scripts out (`pictureSrcdoc`); the frame's `sandbox=""` is still the boundary.
- **Touch targets now 44px:**
  - breadcrumb back links (6);
  - "Back to Sandbox" (3);
  - "Open";
  - "Import more files";
  - the file tree's rows (44px below 1024, 36px on desktop);
  - the new-build shortcuts, now three lines on phones;
  - the header's Sign in (from 40px);
  - the approval demo's checkbox label;
  - the hero pill, through an invisible 6px band, so its look is unchanged.

### Verified

- **Unit tests** for the new decisions: `pickLead`, `playFailure` and `playerNotice` (18 player-logic tests), plus the manifest check in `tests/design/films.test.ts`.
- **In an emulated phone** (Chromium at 375px, demo production build):
  - **Basic playback:**
    - the film plays when scrolled to and pauses when scrolled away;
    - only one video ever plays.
  - **Simulated Low Power Mode** (`play()` refused without a tap):
    - "Play the film" appears with no loading pill, and a tap plays it;
    - the clip shows "Play the clip", and a tap plays it.
  - **A simulated stall:** "Loading the film", then after ten seconds "This is taking longer than usual" with Try again, which recovers.
  - **Recovery:**
    - a film paused by the browser resumes on `pageshow`;
    - a missing recording shows "The film couldn't load", and Try again recovers.
- **At 1280px:** six video elements, the stage clips mounted, the tilt and the aurora on, and only the active clip playing.
- **At 768px:** the inline clips, one playing, and the aurora static.
- **Caching:** versioned requests get `max-age=31536000, immutable`, while unversioned files and posters keep `max-age=0`.
- **The audit:**
  - first pass: 150 page views at 5 widths;
  - after the fixes: 330 page views at 11 widths, with no sideways scroll, no cut-off content and no console errors;
  - the two last small targets were confirmed fixed on a rebuild.
- **Checks:** `pnpm typecheck` and `pnpm lint` are clean. `pnpm test`: 1,303 passed and 14 skipped.

### Not verified

- **Real devices.** No iPhone or Android hardware was available. Causes 1 and 5 are WebKit behaviours the design now avoids, not bugs reproduced here.
- **Reduced motion and Save-Data** weren't emulated in the browser pane. Their rules are unit tested and unchanged.
- **Office Space's console and `/admin`** need a staff sign-in that the demo doesn't have, so they weren't in the audit. Their shells got the same overflow fix.
- **Dynamic routes the demo has no data for:** `/app/build/<run>`, `/app/help/<ticket>`, `/app/sandbox/<session>` and `/app/new/<task>`.

### Next

- **Phone renditions of the four clips** (about half the size).
- **The audit in the deploy checks,** once there's CI that can run Chrome.
- **Visual review** of each route at 320px, beyond what the audit measures.
- **Core Web Vitals:** measure on a phone profile before and after the next performance changes.
