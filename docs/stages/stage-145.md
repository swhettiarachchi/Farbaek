# Stage 145: Four more premium directions, and the launch-day check

- **Branch:** `feat/directions-part-2`.
- **Migration:** none.
- **ADRs:** 0160 and 0161.

## 2026-11-03

### Asked

On launch day, the owner asked for a deep check of the whole platform, and for anything not yet complete to be built. Every site Farbaek makes should be premium, 3D, animated, light unless dark is asked for, and human-made, with real images.

### The platform check (production, before this stage)

- **Deploy:** production was on `8c2435c` (Studio 2).
- **Pages:**
  - 42 public and app routes, plus the kit and media assets, all answered 200;
  - 60 dynamic pages (5 projects with 7 subpages each, 8 tasks, 6 builds, 11 templates) answered 200 with no error markers.
- **Studio 2:** the Element, Sections and Theme tabs render on every static project. None of the existing projects is on the kit yet, so their Theme panel offers **Upgrade its design**.
- **Still open, and only the owner can do these:**
  - merge PR #186 (the first-build estimate);
  - Google Play still answers 401 permissionDenied, so the Play Console permissions need refreshing;
  - submit the closed test for review.

### Done

- **Four premium directions on the Studio kit,** all light by default, with real sorted photos in placeholder slots, a 3D signature, kit motion and labelled sample content:
  - **Online store** (Palm Row):
    - a promo bar with a pause;
    - three hero stories that wipe across, with a count, arrows and a pause;
    - category pills and sorting over the products;
    - sizes, with sold-out ones struck through, and "Select a size" until one is chosen;
    - a wishlist, and a bag drawer that remembers what's in it, with a free-delivery line and an honest checkout;
    - a fanned 3D edit, and a sign-up drawn as a pass.
  - **Product launch** (Tessel Hush):
    - a giant claim, a tilting product and a price chip;
    - a dark chapter where a live wave settles by mode as you scroll, over a Scenes particle field;
    - a closer-look viewer, and specs that count up, with footnotes;
    - a buy bar on phones, and an honest pre-order form.
  - **Portfolio** (Oru Studio):
    - the name across the page in a condensed cut, and a mosaic that tilts;
    - an index with filters and a preview that floats and leans beside the pointer (thumbnails on touch);
    - a viewer with keys, the steps of a shoot, and copying the email.
  - **Event** (Northline 27):
    - a live countdown;
    - the schedule by day and track;
    - last year in real photos, the venue and the passes;
    - a 3D ticket that fills in as you type (first on phones);
    - honest registration, and a calendar file.
- **Prompt mapping** for the four (see ADR 0160): a wedding photographer is a portfolio, and an App Store launch is a launch.
- **Bug fixed:** the bakery's menu filter didn't hide anything, because `display: flex` beat `hidden`. The bakery, booking, CRM and dashboard templates now carry a `[hidden]` rule, and a test requires it wherever a script hides items.
- **Tests added:**
  - every template photo is one of the sorted stand-ins (this caught one mistyped id while building);
  - the new prompt mappings.

### Verified

- **Checks:** typecheck and eslint are clean; vitest passes on `src/core`, `src/content`, `tests/design` and `tests/kit` (128 files, 1063 tests).
- **The site review:** each new direction passes every premium check, with only its placeholder photos left.
- **In the browser** (each template served locally with the live kit, at 1280 and 375 px):
  - **Store:**
    - the stories wipe over each other cleanly;
    - filters and sorting give the right products in the right order;
    - "Select a size" asks first, then adds the item, and the drawer shows the line, quantity, subtotal and "Rs. 2,500 away from free delivery".
  - **Launch:**
    - the mode follows the scroll on desktop and phones;
    - the viewer's tabs swap views;
    - the pre-order message names the finish and says nothing was sent.
  - **Portfolio:**
    - the preview follows and leans beside the pointer;
    - the viewer opens on the clicked project.
  - **Event:**
    - the countdown runs;
    - the Engineering filter keeps the sessions for everyone;
    - choosing "Team of five" and typing a name fills in the ticket.
  - **All four at 375 px:** no sideways scroll, and no control under 44 px apart from the inline footnote markers (24 px, inline in a sentence).

### Studio check (the owner asked whether drag and drop, image replace and text size work)

- **On production** (Sunrise Bakery, drafts only, all undone; nothing was saved):
  - a real mouse drag of a section in the list worked, and so did a drag by the handle inside the preview;
  - the preview toolbar's arrows worked;
  - a text size set on a heading went into the draft but didn't show, because the site's `.section h2` beat the editor's class.
- **None of the five production projects has an image yet,** so Replace was checked on a local build with the store direction as a demo project:
  - Replace with a stand-in photo;
  - a colour on a link that the site styles with `.hero .fs-link`;
  - the Theme panel's looks;
  - add, duplicate and delete a section;
  - text editing and review.
- **Fixed and built (ADR 0161):**
  - a style set in Studio always shows (`!important` in its one-element rule);
  - you can upload a photo inside Replace, and it goes straight into the picture;
  - Replace opens on the photo's own subject and shape;
  - the swatches carry each look's real second accent, and a test reads them from the kit's CSS;
  - a section is named by its own label;
  - uploaded file names keep accented words whole;
  - the store's promo bar no longer shows two messages at once.
- **Verified:**
  - in the local build (the upload with a temporary demo stand-in for the save, removed before the commit): the file is named `assets/shop-front-1.webp`, shows in the picture at once, drops its Placeholder mark and joins Your images;
  - at 375 px the upload control is 44 px, with no sideways scroll;
  - typecheck and eslint are clean, and vitest passes on `src/core`, `src/content`, `src/components`, `tests/design` and `tests/kit` (144 files, 1141 tests).

### Next

- Rebuild blog, booking, dashboard, CRM and the software site as directions.
- Studio extras: spacing and breakpoints, inline text editing in the preview.
