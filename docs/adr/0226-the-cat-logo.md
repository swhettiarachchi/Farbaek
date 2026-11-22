# ADR 0226: The black cat is the logo

- **Status:** accepted (stage 210, 2026-11-22)
- **Builds on:** ADR 0008 (White Signal), ADR 0052 (phone performance), ADR 0055 (no filters), ADR 0056 (the Loom), ADR 0213 (Chat's Dark)
- **Changes:** the logo rule in ADR 0008 and CLAUDE.md ("no plate, frame or filter"), and replaces the artwork ADR 0007 and ADR 0217 describe (the cat knight)

## Context

On 2026-11-22 the owner supplied a new logo, a black cat drawn on white, and asked for three things: use it as Farbaek's logo, remove every old logo, and make its background transparent wherever that is needed.

The old logo (the cat knight) existed as two hand-kept files, a transparent logo and a separate app icon, and 31 files were generated from them for the website, the installed web app, Android, iPhone and the desktop app. Code also knew the old picture's shape (1024 by 1536) in three places.

Two things about the new picture decide the design:

- **It arrived on white paper.** A white square shows as a box on any surface that isn't pure white: Chat's stage, tinted cards, the hero's light.
- **It is black.** A black cat on a dark page can't be seen. Farbaek Chat offers Dark (ADR 0213).

## Decision

**One source.** The owner's image is kept as supplied in `scripts/brand/farbaek-cat-source.webp`. `node scripts/brand-assets.mjs` makes everything else from it, so no brand file is edited by hand and the old artwork has no file left to live in.

**The paper is cut away, the drawing isn't touched.** Paper is the white that can be reached from the image's edge without crossing the drawing. White the drawing encloses (eyes, ears, chest, stripes, claws) can't be reached, so it stays white. The white lines that open onto the paper (between the legs, round the paws, beside the whiskers) are paper and go with it, each as a whole. The soft edge between cat and paper becomes black at part strength, so no white fringe shows on another colour. The result is trimmed to the cat with a small margin: `public/brand/farbaek-logo-v2.webp`, 832 by 1073. Nothing is recoloured, redrawn or sharpened.

**A new address for new artwork.** The website's image cache and people's browsers keep a picture for up to four hours under its address, and the first check of this change found the old logo still served at some sizes. So the logo's file name carries the artwork's number (`-v2`), the old file is gone, and the service worker deletes its kept copy of the old one. Its cache keeps its name, so the device page it holds for offline use is never dropped by this update. The PNG copy (`farbaek-logo.png`) keeps its address, because search engines and other sites may link to it; it is fetched fresh each time.

**Where the background stays.** Transparent is right on a page. It is wrong in three places, which keep the artwork's own white:

- **App icons** (`farbaek-app-icon.webp` and every size made from it): the App Store refuses transparency, and launchers crop to their own shapes. The cat is three quarters of the square's height, so every crop keeps all of it.
- **Tab icons** (32 and 48 px): a browser never crops them, so the cat fills nine tenths of the square, and the paper stays so the cat shows on a dark tab strip.
- **A dark page.** On Chat's Dark the cat sits on its own white paper, as the app icon does: the small logo through `img[data-brand-logo]`, the large welcome figure through a paper of its own (`[data-brand-paper]`), both in `src/styles/chat-theme.css`. CSS draws it, so it is there at first paint. The logo is never inverted: that would be a second logo.

**The 3D scene stays off on a dark page.** The scene draws the logo as a textured plane and has no paper. On Chat's Dark the 2D drawing of the Loom runs instead, with the same rings, stages and motion (ADR 0056).

**Names follow what things do.** `KnightMark` is `BrandMark`, the hero's classes are `figure-*`, and the Loom's geometry speaks of the figure. `LOGO` in `brand-logo.tsx` carries the picture's size, and the Loom reads its proportions from there, so the next change of artwork is one constant.

## Consequences

- CLAUDE.md's logo rules name the cat, the paper on dark, and the one source.
- The logo is wider for its height than the old one (0.78 against 0.67), so headers give it a few more pixels of width at the same height. Checked at 375 and 1280 px.
- **What this change can't reach by itself:**
  - The recorded films (`public/films/`) are recordings of the old interface and show the old logo until they are recorded again.
  - Store listing pictures (`scripts/release/store-images.mjs`) are made from the logo and from screenshots of the apps; they need a new run and an upload, which is the owner's.
  - The iPhone, Android and desktop apps show the new icon after their next release, which is the owner's to publish.
  - Search engines and installed web apps keep their copy of the old icon until they fetch it again.
- A future logo for dark pages, if the owner supplies one, replaces the paper; this ADR would change.
