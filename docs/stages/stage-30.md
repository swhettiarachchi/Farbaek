# Stage 30: Sharper films, the real recording in Low Power Mode, and no buttons on the picture

After Stage 29 the owner sent iPhone screenshots of the films in Low Power Mode. Their complaints:
- the loops looked blurry and blocky, and sometimes stalled;
- every clip had a pause button on it.

They asked for "4K HD cinematic" films that always play.

- **Decision record:** `docs/adr/0057-cinematic-films.md`.
- **Branch:** `feat/cinematic-films`, from `main` after #37.

## 2026-10-24

### Done

**Every film re-recorded** with `pnpm films:record`:
- lossless PNG frames;
- CRF 18 to 22, where it was 23 to 25;
- landscape films at 2560×1600.

| Recording | Before | After |
| --- | --- | --- |
| Build, landscape | 4.8 MB | 10.8 MB |
| Build, portrait | 4.1 MB | 6.5 MB |
| Proof, landscape | 2.4 MB | 5.1 MB |
| Proof, portrait | 2.9 MB | 4.6 MB |
| Clips | 0.9 to 1.1 MB | 1.4 to 2.2 MB |

The budgets are now 12, 8 and 2.5 MB. The WebP loops were remade from the new recordings.

**`SilentLoop`:**
- tries the MP4 itself first, as a `video/mp4` `<picture>` source, which Safari plays as a silent looping image at full quality;
- falls back to the WebP loop where that isn't possible or fails.

**`FilmClip`:**
- no button on the picture while it plays;
- the whole clip is the control: a tap or Space pauses and plays;
- a small "Paused" or "Play" label shows only when it isn't moving.

**Quiet refusals** now need the video not to be downloading, so a slow connection isn't mistaken for a refusal.

### Verified

- **Recording:** every recording is within budget, and the film tests pass (59). They check that each file starts while it streams, that the captions match the script, that the hashes are current, and that each loop is animated WebP within its budget.
- **Quality:** a frame of the old and new `clip-plan` at the same moment, cropped at full size. The new one is cleaner round text during camera moves.
- **Demo production build, headless Chrome:**
  - **Phone:**
    - the clip plays with nothing on the picture;
    - a tap pauses it and shows "Paused", and another tap plays it;
    - no errors.
  - **Desktop:** the new 2560×1600 film decodes and plays.
  - **Phone with `play()` refused:**
    - every film in sight loops;
    - Chrome skips the MP4 source without a request and uses the WebP;
    - pause removes the loop.
- **Audits:** `qa:responsive` and `qa:a11y` on `/` found no issues.
- **Checks:** `pnpm typecheck` and `pnpm lint` are clean; `pnpm test`: 1,328 passed, 14 skipped.

### Not verified

- **Safari on the owner's iPhone in Low Power Mode** playing the MP4 as an image. Chrome can only show the WebP path.

### Next

- The owner reloads the homepage on the iPhone in Low Power Mode, and checks the films are sharp and moving with no buttons on them.
