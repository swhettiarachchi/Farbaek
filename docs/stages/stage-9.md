# Stage 9: Product films on the homepage

The owner asked for cinematic product recordings on the homepage, in the spirit of Shopify's and Clerion's: the main one directly below the hero, more where they help, real video with controls and captions, mobile first, and inside Farbaek's own design.

- **Plan:** approved 2026-10-21.
- **Decision record:** `docs/adr/0034-product-films.md`.

## 2026-10-21: the film stage, the recordings and the player

### Done

**The film stage** (`/film-stage/[film]`, dev only behind `FARBAEK_FILM_STAGE=1`):
- **What it shows:** Farbaek's real components with a labelled sample project (Harbor Café, built from the local-business starter), choreographed as a pure function of time.
- **Camera and stage:**
  - a light porcelain stage with the signal-blue aurora and the dot grid;
  - the app window rests at a tilt, then dollies to the control in use;
  - scenes cross-dissolve with a depth blur;
  - the cursor clicks with a ripple.
- **The finale:** a browser window and a phone show the real published site.

**The recordings** (`pnpm films:record`, `public/films/`):
- **"One build, start to finish"** (54 s): landscape and its own portrait cut.
- **"Proof before anything ships"** (32 s): landscape and portrait.
- **Four 10-second feature clips:** plan, agent, check and live.
- **Encoding:** H.264 with faststart and no audio track. Each comes with a poster frame and WebVTT captions and chapters.
- **Size:** the recorder keeps the frames and re-encodes at a higher CRF until each file fits its budget.

**The player** (`src/components/films/`):
- **`FilmTheater`:**
  - the double-bezel stage, which tilts back and settles flat as it scrolls in;
  - the portrait cut on phones;
  - playback only while 45% visible in a visible tab, never on its own under reduced motion or Save-Data, and a person's pause stays;
  - a chapter-segmented scrubber, captions on by default, full screen, and the keys Space/K, the arrows, J/L, C and F;
  - loading and error states;
  - a chapter rail (vertical on desktop, pills on phones) with "Try it" links;
  - the transcript.
- **`FilmClip`:** silent loops with a pause button.
- **`FeatureFilms`:** "What it does for you". The text scrolls past a pinned stage that cross-fades between clips. On phones the clips are inline.
- **Posters:** served through the image optimiser, with the portrait poster on phones.

**Homepage:** hero, build film, statement, feature clips, showroom, proof film (keeps `#how-it-works`), then the existing sections. The concept film and the illustrated thread are removed.

### Verified

- **Recordings,** all within budget, 22 MB in total:

  | Film | Landscape or clip | Portrait |
  | --- | --- | --- |
  | Build | 5.95 MB (CRF 25) | 4.67 MB |
  | Proof | 3.50 MB | 3.27 MB |
  | Clips | 0.96 to 1.10 MB | |

  Frames pulled from the encoded MP4s are sharp, with no visible artefacts on text.
- **Unit tests:**
  - the player's rules (`player-logic.test.ts`, 12);
  - the timeline.
- **`tests/design/films.test.ts`:**
  - every recording exists, fits its budget and starts before it has fully downloaded (moov before mdat);
  - the captions and chapters match `films.ts`;
  - the chapters are ordered;
  - the copy rules hold.
- **The film stage guard:** 404 without `FARBAEK_FILM_STAGE=1`, and for unknown films.
- **Commands:** `pnpm typecheck`, `pnpm lint` and `pnpm build` pass.
- **Full `pnpm test`:** 1044 passed. In each full run, one existing test that spawns processes timed out under load: once `src/agent-runtime/broker.test.ts`, once `desktop/src/main/runs.test.ts`. Both pass when run on their own (15 of 15), and this stage doesn't touch them.
- **Browser, production build:** headless Chrome, 31 checks, all passing.
  - **Desktop, 1280×800:**
    - nothing downloads at the top of the page;
    - the build film plays once on screen, with the landscape cut;
    - K pauses, and the pause survives scrolling away and back;
    - L jumps a chapter and C toggles captions;
    - a rail chapter seeks and plays, and shows its "Try it" link;
    - full screen opens;
    - it pauses off screen;
    - the pinned stage plays only the active feature's clip through all four;
    - the proof film plays;
    - no horizontal scroll and no page errors.
  - **Phone, 375×812:**
    - the portrait cut loads and plays, and the landscape one never downloads;
    - every film control is at least 44px;
    - no horizontal scroll.
  - **Tablet, 768×1024:** layout, with no horizontal scroll.
  - **Reduced motion:**
    - nothing starts or downloads;
    - the poster shows a play button, and pressing it plays;
    - the clips stay still.
  - **Error state:** a blocked recording shows "The film couldn't load." with Try again, and "Read what happens" opens the transcript.
- **Bugs found and fixed in these checks:**
  - a failed load's pause event hid the error state;
  - two features sharing the middle band could leave the wrong clip on stage;
  - the stage settled flat too late;
  - the phone scrubber sat below the buttons.

### Not done yet

- **Deploying:** this merges after PRs #8 and #9 and the LaunchOS branch, and Railway has to be back.
- **Real devices:** Save-Data and iPhone's video-only full screen are handled in code but weren't tested; headless Chrome can't emulate either.
