# Stage 146: Typing in place, space per side, and the booking and blog directions

- **Branch:** `feat/studio-3-directions`, stacked on `feat/directions-part-2` (PR #189).
- **Migration:** none.
- **ADRs:** 0162 and 0163.

## 2026-11-03

### Asked

"Continue building", after the Studio check (stage 145).

### Done

- **Studio** (ADR 0162):
  - **Type in place:** double-click or double-tap words in the preview to type over them. Enter keeps them; Escape puts them back. Only elements that hold just words can be typed over.
  - **A still edit preview:** timers of two seconds or more wait while you edit, so a carousel or promo stays on what you clicked. A countdown ticking each second still runs.
  - **Space per side:**
    - inside the element (top, bottom and sides) and outside it (above and below);
    - presets that scale with the screen (None, Tight, Comfortable, Generous and Grand) or exact px.
  - **The "a site rule wins" warning** no longer fires for sizes that scale with the screen, which it couldn't compare.
- **Booking direction** (Mirror & Comb):
  - services with filters, people, two weeks of open times from the hours;
  - a summary that follows along, an honest booking, a calendar file;
  - a live 3D "next chair free" card;
  - real salon photos.
- **Blog direction** (Slow Roads):
  - a featured story, topics and a search, an honest newsletter;
  - an essay with a CSS reading line, contents that follow along, a drop capital, a pull quote and a facts box;
  - real travel and food photos.
- **Prompt mapping** for both, with a blog asked for outright winning over food. The photo test now checks Picsum ids too.

### Verified

- **Checks:** typecheck and eslint are clean; vitest passes on `src/core`, `src/content`, `src/components`, `tests/design` and `tests/kit` (144 files, 1146 tests).
- **The site review:** both directions pass every premium check, with only their placeholder photos left.
- **In a local demo build**, with the store direction as a temporary demo project (never committed):
  - the hero held still for 45 seconds;
  - a double-clicked headline took typed words into the draft;
  - the Grand space applied without a warning.
- **In the browser, at 1280 and 375 px:**
  - **Booking:** "next chair free" worked out to "Tomorrow, 9 am"; a skin fade with Dinesh on Thursday at 9 am showed in the summary at Rs. 3,000, and the confirmation said nothing was sent.
  - **Blog:** Coast with the search "pier" found the beaches story; the contents followed the section being read; the reading line filled.
  - **Both:** no sideways scroll at 375 px, and every target at least 44 px.

### Next

- The software site as a direction, carrying over its working product demo.
- Studio: styles for phones only.
