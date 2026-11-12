# Stage 185: The site preview on phones

- **Branch:** `feat/mobile-preview`, from `main` (dca16c4).
- **ADR:** 0195.
- **Migration:** none.
- **Skills:**
  - **The design brief and the premium moves:** `premium-app-ui`, with the project's own White Signal rules first. One hero (the site), controls where a thumb rests, glass only on the floating bar, a skeleton that matches the layout, motion only when allowed.
  - **Phone screens:** `mobile-app-ui-design`: full width, 44 px targets, primary actions low on the screen.
  - **The look:** `farbaek-ui` and `farbaek-human-made`: tokens only, pills, one icon set, a number only when it's real (the scale of a scaled desktop).
  - **Checks:** `built-in-browser` and `chrome-browser`, at 375 px and on a desktop.

## What the owner asked

"When a user creates a website through our platform using a mobile device, the website preview should be displayed in an attractive, full-width, modern, and visually appealing layout. The preview must be fully responsive, mobile-friendly, and easy to navigate."

## What changed

- **`src/components/preview/static-preview.tsx`:**
  - edge to edge on a phone, with the site at the phone's real width;
  - Phone, Tablet (wide screens only) and Desktop as real device widths, the desktop layout scaled to fit with its scale shown;
  - a browser bar (back, the page as an address and page list, reload, full screen);
  - a full-screen dialog with its controls at the bottom;
  - a skeleton until the site draws;
  - a device narrower than its stage (Phone or Tablet on a computer) sits on it like a device, 16 px from the top and bottom, with 28 px corners, a hairline ring and a soft shadow. On a phone, the Phone view stays edge to edge.
- **`src/core/workspace/preview-geometry.ts`:** the sizes, with six tests.
- **Docs:** ADR 0195.

## Verified

- **Before** (production code, a demo build at 375 px): the template preview was 291 px wide, and its device buttons couldn't show a phone or a desktop layout on a phone.
- **After**, on a demo build of this branch in the built-in browser:
  - **At 375 px:** the stage reaches the card's edges (341 px). Phone is chosen by default, so the site's window is the full width. Desktop draws a 1280 px window scaled to 27% and says so.
  - **Full screen:** fills the screen (375 by 812). Its bottom bar holds Close, Back, the page, Reload and Phone/Desktop.
  - **At 1280 px:** Desktop fills the stage (869 px); Phone is a 390 px window in the middle.
- **Audits** on three template previews and a project page:
  - `qa:responsive`, 44 page views from 320 to 1440 px: nothing scrolls sideways, is cut off, is too small to tap, or logs an error;
  - `qa:a11y`, 8 page views: no findings.
- **Tests and checks:** `preview-geometry` (6 tests) and `tests/design` (180) pass. Typecheck (in the build) and lint are clean.
- **The device frame** (demo build, built-in browser): at 1280 px, Phone is a 390 px window 16 px from the stage's top and bottom, with 28 px corners and a hairline ring; at 375 px it stays edge to edge (341 px), with no corners and nothing scrolling sideways.
- **The site drawn inside the new frame, in real Chrome** (the bakery template, on a computer): Desktop fills the stage with the site's desktop layout; Phone shows the site's phone layout, with its menu button, in a 390 px window; and Full screen shows the phone window above the glass bar, with Escape closing it. The built-in browser can't show this, because it doesn't run scripts in sandboxed frames.
- **Not seen in real Chrome at 375 px:** Chrome is maximised, so its window can't be narrowed, and Farbaek's pages refuse to be framed. The 375 px layout was checked in the built-in browser (above). The site inside the frame at that width is the same document as the Phone view.

## Not done

- **The visual editor's own frame** is unchanged.
