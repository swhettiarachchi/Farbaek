# ADR 0057: Sharper films, the real recording in Low Power Mode, and no buttons on the picture

- Status: accepted (2026-10-24).
- Builds on ADR 0034 (the films), ADR 0055 and ADR 0056 (silent loops).

## Context

The owner checked the films on an iPhone in Low Power Mode and asked for "4K HD cinematic" quality, films that always play, and no play or pause buttons on them.

Three causes:
- **Blurry, blocky loops.** In Low Power Mode the owner saw ADR 0056's animated WebP loops: 480 to 640 px wide, 10 fps and heavily compressed. Safari also decodes long animated WebPs in software, so they can stall.
- **Compressed recordings.** The recordings themselves passed through JPEG before encoding, at about 0.6 to 0.9 Mb/s:

  | Format | Resolution |
  | --- | --- |
  | Landscape | 1920×1200 |
  | Portrait | 1080×1350 |
  | Clips | 1440×1080 |

- **A button on every clip:** a round pause button sat on each one while it played.

## Decision

**Sharper recordings** (`scripts/films/record.mjs`):
- **Lossless frames:** frames are captured as PNG, so the only compression is the film's own. Stills and posters stay JPEG, at quality 92 for posters.
- **Less compression:** CRF starts at 20 for landscape and 18 for portrait and clips (it was 25, 23 and 23), with a ceiling of 26.
- **Larger budgets:** 12 MB landscape, 8 MB portrait, 2.5 MB per clip (`FILM_BUDGET_BYTES`).
- **Landscape films are filmed at 2560×1600,** twice their stage size, because they can go full screen on large displays.
- **Portrait films and clips keep their sizes.** Portrait is already wider (1,080 px) than any phone shows it (about 1,030 device pixels). Clips are 1,440 px wide and shown at up to 1,280.
- **Not 4K:** no screen shows these films wider than about 1,760 device pixels outside full screen. 4K would roughly triple the download for nothing anyone can see.
- **The results** (the recorder raises CRF by 2 until a file fits its budget):

  | Recording | Before | After |
  | --- | --- | --- |
  | Build, landscape | 4.8 MB | 10.8 MB, 2560×1600, CRF 22 |
  | Build, portrait | 4.1 MB | 6.5 MB, CRF 18 |
  | Proof, landscape | 2.4 MB | 5.1 MB, 2560×1600, CRF 20 |
  | Proof, portrait | 2.9 MB | 4.6 MB, CRF 18 |
  | Clips | 0.9 to 1.1 MB | 1.4 to 2.2 MB, CRF 18 to 20 |

**The real recording in Low Power Mode:**
- `SilentLoop` now tries the MP4 itself first, as a `video/mp4` source in a `<picture>`. Safari plays that as a silent, looping image, at full quality and frame rate with the phone's video decoder.
- Browsers that can't play an MP4 as an image skip the source without downloading it and use the WebP loop. An MP4 that fails falls back to the WebP too.

**No buttons on a playing clip:**
- The whole clip is a button: a tap or Space pauses it and plays it again, as WCAG 2.2.2 requires.
- A small "Paused" or "Play" label shows only when the clip isn't moving: paused, under reduced motion, or with Save-Data.
- "Try again" still shows after a failure.
- The theater keeps its control bar (captions, chapters, scrubber, full screen). Its big play cover shows only under reduced motion or Save-Data, or if neither the film nor its loop will play.

**A slow download isn't a refusal.** The quiet-refusal check (`QUIET_REFUSAL_MS`) now also needs the video not to be downloading. A slow connection keeps the poster until the first frame instead of starting a second download for the loop.

## Consequences

- **More bytes.** A phone that scrolls the whole homepage downloads more video than before. Only films in sight load, `preload="none"` still holds, Save-Data still stops autoplay, and every file is cached for a year by its hash.
- **Low Power Mode on iPhone shows the real recording,** not a reduced copy, assuming Safari plays it as an image there. The WebP stays as the fallback.
- **Not verified here:** Safari on the owner's iPhone. Chrome can only show the fallback path.
