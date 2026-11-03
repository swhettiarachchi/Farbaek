# Stage 145: Four more premium directions, and the launch-day check

- **Branch:** `feat/directions-part-2`.
- **Migration:** none.
- **ADR:** 0160.

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

### Next

- Rebuild blog, booking, dashboard, CRM and the software site as directions.
- Studio extras: upload inside the editor, spacing and breakpoints, inline text editing.
