# Stage 34: Films start before they're seen

The owner asked for the homepage films to be playing as soon as people arrive. They took a moment to start.

- **Decision record:** `docs/adr/0061-films-start-ahead.md`.
- **Branch:** `feat/instant-films`, from `main` after #40.

## 2026-10-24

### Done

**When films start** (`PLAY_AHEAD` and `PRELOAD_AHEAD`):
- a film plays within a screen below the view and rests a quarter of a screen above it;
- it downloads within two screens below;
- `useOnScreen` uses two observers for this.

**The players** set `preload="auto"` when near, except under reduced motion or Save-Data.

**First-touch unlock** (`use-playback.ts`): films a browser refused wait for a person's next tap, click or key. That gesture plays each one, pausing at once those that shouldn't move yet, and the real recording replaces the silent loop.

### Verified

**On the demo production build, in headless Chrome:**

- **Time from scrolling into view to moving, on simulated 4G** (9 Mb/s, 120 ms):

  | | Before (the live site) | After |
  | --- | --- | --- |
  | Phone, 393 px | 0.75, 1.1 and 1.3 s | 0 to 3 ms: already playing |
  | Desktop, 1440 px | | 1 to 2 ms: already playing |

- **On arrival:** the first film is playing on 393 and 430 px phones. On 375×667 it's downloaded and starts with the first scroll.
- **A whole-page scroll:**
  - at most two films play at once on a phone;
  - with `play()` refused, every film in sight loops;
  - no errors.
- **Simulated Low Power Mode** (`play()` refused unless a person is touching): the loop shows; after one tap the real film plays and the loop is gone.
- **Reduced motion:** nothing plays, every video is `preload="none"`, and no MP4 is requested.
- **Audits on `/`:**
  - `qa:responsive` and `qa:a11y` found nothing;
  - `qa:vitals`: LCP 2,020 ms, CLS 0, TBT 313 ms, much as before.

### Not verified

- **An iPhone in Low Power Mode:** the owner's phone is the check.
