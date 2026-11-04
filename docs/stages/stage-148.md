# Stage 148: Studio films

- **Branch:** `feat/studio-films`.
- **Migration:** none.
- **ADR:** 0164.

## 2026-11-04

### Asked

The owner sent six screenshots of the homepage films and asked for them to be recorded again, with text, and made beautiful, modern, premium, 3D, luxury and professional.

### What was wrong

- **The window was cropped.** To make text readable, the camera zoomed the whole window, which cut the sidebar off at the left. This showed in the Build, Check and Publish clips and in the proof film.
- **Blank frames.** The Plan clip opened on an empty main area, and every clip faded the whole window out and in at its loop point.
- **No words of its own.** A film only explained itself through the captions under the player.
- **A mismatched sample.** The film typed "Harbor Café", but its live preview showed the bakery the template now builds, Kiln & Crumb.

### Done

- **A studio for every film** (`src/components/films/stage/studio.tsx`, ADR 0164):
  - a headline opens each chapter, its words rising one by one, with one word in signal blue and a line under it;
  - the window sits beside the headline in a frosted glass frame, turned toward it in 3D, with a soft shadow on the stage floor;
  - then the card that matters lifts out toward the viewer, big enough to read, while the window behind falls out of focus;
  - a band of light crosses each card as it rises, and the pointer clicks on the lifted card.
- **Sharp text:** each card flies in 3D, then rests flat and square to the camera while it's read, so its text is drawn at its true size.
- **The window is never cropped;** it moves between the headline pose and a centred pose behind the card.
- **Clips loop without a seam,** opening on a finished frame instead of a blank one.
- **The sample is the bakery the template builds,** Kiln & Crumb in Kandy, everywhere.
- **The build film** is 58 s and ends on the live site in a browser window and on a phone, beside "From one sentence to a live site."
- **The proof film** is 43 s and ends on "Proof before anything ships."
- **The phone (portrait) cuts** follow the same choreography, with the headline above the app.
- **The old camera rig and pointer** are removed from `primitives.tsx`.
- **The recorder streams frames into ffmpeg** instead of saving them, and encodes two qualities at once. The first full recording had stopped with the disk full. The loop script now fits each loop to its budget too.
- **Two tests fixed on the way:**
  - The mesh and security-eval tests now remove their temp folders. Over a week they had left about 5,500 folders (19 GB) in `%TEMP%`.
  - A start-from-prompt test used a prompt that now picks the landing-page direction. It uses one that picks the plain starter.

### Recordings

| Film | Size | Quality (CRF) | Loop |
| --- | --- | --- | --- |
| Build, landscape 2560×1600 | 10.8 MB | 24 | 2.3 MB |
| Build, portrait 1080×1350 | 7.7 MB | 23 | 2.4 MB |
| Proof, landscape | 10.2 MB | 20 | 1.1 MB |
| Proof, portrait | 6.5 MB | 21 | 2.3 MB |
| Plan, Agent, Check and Live clips, 1440×1080 | 1.8, 1.8, 1.1 and 2.1 MB | 21, 21, 18 and 18 | 0.4 to 0.6 MB |

### Verified

- **Every chapter frame by frame on the film stage:** landscape, portrait and the four clips.
- **Full-resolution stills and frames from the finished videos:**
  - lifted cards are sharp;
  - the live preview shows the bakery with its photo and fonts;
  - each clip's first and last frames match.
- **On the homepage, in a production build:** the build film plays from its new versioned file, with "58 seconds, 6 chapters" and the new chapter times on the rail.
- **Checks:**
  - typecheck and lint are clean;
  - 143 design tests pass, including the film budgets, captions and manifest;
  - the full unit suite passes after the two fixes above;
  - the security evaluation passes 36 of 36 and its report is updated.

### Not checked

- **The films on a real phone,** and Safari's silent loop on an iPhone in Low Power Mode.

### For the owner

- **About 19 GB of old test folders** (`farbaek-mesh-*`, `farbaek-web-*`, `farbaek-webrx-*`) are still in `%TEMP%`. Auto mode wouldn't let Claude remove them. They're safe to delete, and new test runs no longer add to them.
- **C: had about 1.4 GB free** during this stage.
