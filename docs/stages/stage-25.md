# Stage 25: Phone performance, measured

The owner asked for Farbaek to stay smooth on less powerful phones, with performance changes backed by measurements. This stage:
- adds a repeatable lab measurement;
- takes a baseline;
- fixes the biggest costs;
- measures again.

- **Decision record:** `docs/adr/0052-phone-performance.md`.
- **Branch:** `feat/phone-performance`, from `main` after #31.
- **Plan mode:** like Stage 24, this started without it, at the owner's request; this file is the record.

## 2026-10-23

### Done

**`pnpm qa:vitals`** (`scripts/qa/vitals.mjs`):
- **The profile:** Lighthouse's mobile one: 412 × 823, 4× CPU, 150 ms RTT, 1.6 Mbps.
- **Each page loads three times,** cold.
- **It reports the medians:**
  - LCP and its element;
  - CLS, TBT and FCP;
  - bytes by kind, with scripts split into the page's own and those that arrive later (prefetching).

**Fixes, in order of effect:**

| Fix | What it does |
| --- | --- |
| 3D only with a mouse or trackpad (`canRun3D`) | Phones keep the static knight and orbit. The scene alone was about 240 KB and 650 ms of TBT on the phone profile. |
| `Reveal` as a CSS entrance | The hero no longer waits for hydration to become visible. |
| AVIF images (`images.formats`), and `fetchPriority="high"` on the hero art | The hero art went from 162 KB to 71 KB. |
| `content-visibility: auto` on the homepage sections below the first screen (`.home-later`) | About 350 ms off the first paint. |
| `AnchorLayout` | Lays all sections out before any in-page jump, so anchors land exactly. |
| `scroll-behavior: smooth` only under `html:focus-within` | An animated arrival can't race the landing. |
| The public mobile menu in CSS (`sheet-in`, `sheet-out`, `menu-rise`) | Motion now loads only on the homepage. |
| `WhenNear` | Proposal diffs (CodeMirror) mount within 600 px of the screen, not on page load. |
| 32 and 48 px favicons, before the 512 px one | The 206 KB icon was being fetched by every page. |

**Docs:**
- ADR 0052;
- `CLAUDE.md`: the 3D rule now includes touch-first screens, and `pnpm qa:vitals` was added;
- the `farbaek-ui` skill.

### Verified

- **Baseline, then after** (median of three, phone profile):
  - **the homepage:**
    - LCP 4.1 s → 2.0 s;
    - TBT 907 → 211 ms;
    - FCP 2.6 → 1.5 s;
    - JS 531 → 287 KB;
    - total 1,377 → 579 KB.
  - **the task page:** TBT 585 → 226 ms, JS 555 → 351 KB.
  - **`/app` pages:** JS 292 → 247 KB.
  - **every page:** about 200 KB less downloaded.

  The full table is in ADR 0052.
- **The 3D cost:** on the homepage with the scene on, TBT was 723–929 ms over three runs; with it off, 184–263 ms.
- **Anchors:** `#status`, `#demo` and `#faq-title` land at 80 px from the top, the same as production.
  - **Checked every way in:**
    - arriving with a hash;
    - the hero pill;
    - from `/pricing` through the menu.
  - **Coverage:** three runs each at 1280, 390 and 360 pixels.
  - **The fix sequence:**
    1. Before `AnchorLayout`, `#status` landed 2,317 px off on desktop.
    2. With it, the phone arrival still raced the smooth scroll.
    3. Smooth scrolling under `html:focus-within` settled it.
- **Scrolling:** wheel-scrolling the homepage at 1280 and 390 px went through the sections in order, with no backward jumps and no blank frames.
- **The desktop feature stage** still sticks at 96 px.
- **The mobile menu** (headless Chrome, 375 px):
  - the frosted sheet fades in and the links rise in turn;
  - it opens with the first link focused and the page locked;
  - Escape closes it, returns focus to the button and unlocks the page.
- **`pnpm qa:responsive`** at 320, 375, 768 and 1280 px: 120 page views, nothing found.
- **Checks:** `pnpm typecheck` and `pnpm lint` are clean. `pnpm test`: 1,303 passed and 14 skipped.

### Not verified

- **Real phones and field data.** These are lab numbers from an emulated phone. No visitor metrics are collected; that would need consent and a collector.
- **The 3D scene on tablets with a trackpad.** They report a fine pointer, so they get 3D; untested.
- **Office Space and `/admin`** (staff sign-in).

### Next

- **The shared 39 KB chunk on every page:** see whether part of it can load later.
- **Phone renditions of the feature clips** (carried over from Stage 24).
- **Prefetching on Save-Data connections:** whether to switch it off for them.
