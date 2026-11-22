# Stage 210: the black cat is Farbaek's logo

- **Date:** 2026-11-22
- **Branch:** `feat/new-logo-cat` (from `main`)
- **Decision:** ADR 0226
- **Migration:** none. **New dependency:** none.

## What the owner asked

"Use this as new Farbaek logo. Remove all old logos. Please make the background transparent wherever necessary." The image is a black cat on white paper.

## What was done

- **One source.** The owner's image is kept as supplied in `scripts/brand/farbaek-cat-source.webp`. `node scripts/brand-assets.mjs` now makes the logo, the app icon and every size from it: 33 files for the website, the installed web app, Android, iPhone and the desktop app. The two hand-kept files of the old artwork are gone, so the old logo has no file left in the repository.
- **Transparent where a page shows through.** The paper round the cat is cut away; the white inside the drawing (eyes, ears, whiskers, chest) stays. The edge is black at part strength, so no white fringe shows on a tinted surface. Nothing is recoloured or redrawn.
- **White where it's needed.** App icons keep the artwork's own white (the App Store refuses transparency, and launchers crop), and so do tab icons (a black cat would vanish on a dark tab strip).
- **Chat's Dark.** A black cat can't be seen on a dark page, so there it sits on its own white paper: the small logo in the sidebar and beside answers, and the large cat on the welcome screen. CSS draws it, so it is right at first paint. The 3D scene has no paper and stays off on Dark; the 2D drawing of the Loom runs instead.
- **A new address.** The logo is `public/brand/farbaek-logo-v2.webp`. See "What the first check found".
- **Code that knew the old picture.** `LOGO` is 832 by 1073; the Loom reads the picture's proportions from it instead of a fixed 2 to 3; the device page's logo has the right width. `KnightMark` is `BrandMark`, the hero's classes are `figure-*`, and comments say what is on screen now.
- **Rules.** CLAUDE.md and AGENTS.md describe the cat, the paper on dark and the one source.

## What the first check found

Screenshots of the local site showed the old logo, stretched, at some sizes. The website's image cache keeps each size of a picture for up to four hours under the picture's address, and the new logo had kept the old address. A browser does the same. After a release, people (the owner first) would have seen the old logo for hours.

The fix: new artwork gets a new address (`-v2`), and the service worker's cache is renamed (`farbaek-offline-v3`) so its kept copy of the old logo is dropped. The PNG copy keeps its address, which other sites may link to; it is fetched fresh each time.

## Verified

- `pnpm typecheck`, `pnpm lint`: clean.
- `pnpm test`: 4,190 passed, 17 skipped (477 files passed, 5 skipped).
- `pnpm build`: passes.
- **By eye, on the local demo workspace, at 375 and 1280 px:** the homepage, `/build`, `/sign-in`, the app's Home, Chat in Light and in Dark, Build's start page and the device page. Every logo is the cat at its own proportions (measured on the page: 23 by 30, 25 by 32, 62 by 80 and so on, each 0.78 wide for its height), with no white box on tinted surfaces and its paper on Dark.
- **The 3D hero** runs with the new picture in a desktop browser (the WebGL canvas takes over from the still picture).
- The generated logo, the 512 px icon and the 48 px tab icon were looked at one by one.

## Not verified, or not reached by this change

- **Real phones.** The checks are emulated screens.
- **The recorded films** (`public/films/`) are recordings of the old interface. They show the old logo until they are recorded again.
- **Store listing pictures** are built from screenshots of the apps, which have the old logo inside them. They need new screenshots after the apps are released, then a new run of `scripts/release/store-images.mjs` and an upload. The Play feature graphic's layout is already adjusted for the new shape.
- **The iPhone, Android and desktop apps** carry their icon inside the app. The new files are in the repository; people see them after the next release of each, which is the owner's to publish.
- **Search results and already-installed web apps** keep their own copy of the old icon until they fetch it again.

## Next

- The owner merges the PR; production deploys by itself. Then check `/api/health` and the live header.
- New app releases when the owner wants the icon changed on phones and the desktop.
- Re-record the films when the interface next changes enough to need it.
