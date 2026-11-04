# Stage 150: Studio styles for phones only

- **Branch:** `feat/studio-phone-styles`.
- **Migration:** none.
- **ADR:** 0166.

## 2026-11-04

### Asked

"Continue building", with a full platform audit and a security check (the security work is stage 151).

### Done

- **Studio's Style section** starts with "Applies to: Every screen / Phones only".
- **The choice follows the preview:**
  - the Phone preview sets "Phones only", and Tablet or Desktop sets "Every screen";
  - choosing "Phones only" shows the phone preview.
- **Phone styles go into one marked block** for screens up to 640 px wide, at the end of the page's stylesheet (or its style block). Rules for every screen stay above it, so the phone rule wins on phones.
- **The "a site rule still wins" warning** only runs when the preview shows the screen the style is for.
- **The confirmation reads** "Applied to phones only, in the draft".

### Verified

- **Unit tests (61 pass in Studio):**
  - a phone style makes the block, and an every-screen style for the same element lands above it;
  - a second phone change updates the same rule, and another element joins the same block, with one `@media` in all;
  - phone styles also work in a page's style block;
  - any other scope is refused.
- **In a demo build, with the software site served to the visual editor** (a temporary local change, reverted, not committed):
  - picking the headline and choosing "Phones only" switched the preview to Phone;
  - a 30 px size applied with "Applied to phones only, in the draft";
  - the review diff showed the `/* Studio: phones only */` block at the end of `styles.css`.
- **Checks:** typecheck and lint clean.

### Next

- Security hardening from the platform review (stage 151).
