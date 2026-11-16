# Stage 196: Proportioned on every screen

- **Branch:** `feat/stage-196-proportions`, from main after #258 (stage 195's field test) went live.
- **Migration:** none.
- **Why:** the owner found Farbaek oversized and uncomfortable on phones: letters, icons, buttons and parts too big, with poor spacing, proportions and alignment, across the platform and in Survey Studio. They asked for a full responsive and UI pass, testing every page at many sizes, with the causes fixed rather than patched.
- **Decision:** [ADR 0211](../adr/0211-proportioned-on-every-screen.md).

## What was found

Three read-only inventories (the design system, the shells and pages, Survey Studio) and a design review of the plan found the causes in a few shared pieces:

- **Sizes only stepped up.** The phone size was the base: titles of 28 to 46px, 32px section titles.
- **Spacing didn't compress:** 32px between every page's sections, 80px around marketing sections, and 44px a side lost to the double bezel.
- **Controls were 48px everywhere,** with a mouse too.
- **Tablets** got the phone layout stretched, with the tab bar squeezed in the middle.
- **Survey Studio:**
  - the step strip had a scrollbar and could hide the current step;
  - buttons overflowed at 360px;
  - title fields sat two to a row on a phone;
  - Save scrolled away;
  - the sheet opened with 2px text;
  - a finger on a label dragged it;
  - a second finger on a line never pinched;
  - point entry was a 640px table;
  - 14px selects made iPhones zoom;
  - in-app links dropped unsaved edits without asking.
- **The audits** never measured oversize and skipped Survey Studio, office, admin and shared pages.

The phone baseline at 390px, before any change: 70 page views, every one out of proportion. Titles were 39 of the findings, reading text 28, padding 25 and nested insets 35.

## Done

1. **Audits** (`scripts/qa/`):
   - one route list for both audits, `routes.mjs`, now with Survey Studio's nine steps, `/survey`, skills, subscribe, offline and the device page;
   - landscape phones (844×390, 667×375) and touch iPads (1024, 1180, 1366);
   - overlays opened by script: the public menu, the workspace list, the palette and the assistant's answer;
   - a tap probe, checking that a widened tap area still reaches its control;
   - a proportion report on phones, with limits that follow the text size;
   - `--strict`, which fails on all of them;
   - `contact-sheet.mjs`, which lays the screenshots side by side.
2. **Controls:**
   - buttons are 40px (`sm`), 44px (`md`) and a 40px circle (`icon`), with a 48px touch area (`.tap`);
   - fields are 44px with 16px text on touch, and 40px with 14px text with a mouse on a large screen;
   - one `mergeClasses` serves both, and its fix keeps the office code fields large;
   - segmented controls slim to 40px options;
   - 26 hand-made icon buttons moved to the same 40px circle.
3. **Type:**
   - the title styles start at the phone size and step up;
   - new styles for the home headline, a public section, a part of a document, and the lead;
   - `CardTitle`, `EmptyState`, prices, KPIs, the score ring and proof seals all step down on a phone;
   - the prompt box is never taller on a phone than on a computer.
4. **Spacing:** `surfaces.ts` holds `PAGE_STACK` (42 copies replaced) and `BEZEL` (31), and `system.test.ts` gates both. Cards pad 16px on a phone, marketing sections 56px.
5. **Shells:**
   - the tab bar spreads out on tablets;
   - a search button opens the palette on a phone;
   - the demo band is one line;
   - the workspace list and the public menu scroll;
   - the footer logo is smaller;
   - every office and admin table is a card per row on a phone;
   - the office header fits a narrow phone;
   - FAQ and comparison rows are 48px.
6. **Survey Studio:**
   - **The plan editor:**
     - one pointer model, with a pinch about the fingers (`view-math.ts`, 7 tests);
     - a label moves under a finger only once it's selected;
     - tap areas round lines and points;
     - a memoised drawing;
     - the sheet opens on the drawing on a narrow screen;
     - full screen on phones and tablets;
     - a sticky toolbar;
     - a container-query side panel;
     - the selection over the sheet on a phone;
     - a question before leaving unsaved edits;
     - the assistant steps aside while another field is typed in.
   - **The step strip** brings the current step into view.
   - **The review list** folds to one line below a large screen.
   - **Point entry** is a card per point on a phone.
   - **The points list** scrolls in a capped frame with its header and numbers pinned.
   - **Import:** the switch, fields and button fit.
   - **Export:** the buttons are calmer.
7. **The sweep:**
   - the Agent Core panel;
   - code under review at 14px on a phone;
   - the visual editor's frame;
   - More (rows and the sign-out button);
   - the help reply box.

## Verified

- **Per milestone:**
  - `pnpm typecheck`, `pnpm lint`, and the design, component and Survey tests;
  - `pnpm test` in full at the controls and spacing milestones (3,550 and 3,552 passed).
- **Survey Studio by script** in headless Chrome at 390px with touch:
  - the sheet opened on the drawing;
  - a two-finger pinch sent through Chrome's touch events zoomed three times, the fingers having spread three times as far;
  - a one-finger pan moved the view;
  - a tap 5px off a point picked the point;
  - full screen gave the sheet 736 of 800px.
- **Editing, on a local unlock of the Sample** (never committed):
  - a finger dragging an unselected label panned the sheet and left the plan unchanged;
  - a tap selected the label;
  - dragging it then moved only the label, and the toolbar said "Unsaved changes";
  - the Check step's link asked before leaving, and declining stayed.
- **Contact sheets** of every route at 390 and 768, before and after.
- **The full responsive audit on the demo build:**
  - every route on 16 screens, 1,130 page views: 320 to 1440px, two landscape phones and three touch iPads;
  - no sideways scroll, nothing cut off, no lost taps, no crowded frames, no console errors;
  - three touch-iPad pages had small targets in the trust map, fixed and rechecked clean on all five sizes;
  - out of proportion on phones went from all 70 page views to under a fifth;
  - what remains is by design: an open answer card covering part of the screen until it's dismissed, text beside its own picture, and the app's 404 using the public title.
- **The largest text** (`--text-scale=2` at 375): no sideways scroll, small targets, lost taps or crowded frames.
- **`pnpm qa:a11y`** at 1280 and 375: 136 page views, 0 findings.
- **`pnpm qa:vitals`** (phone profile, lab numbers), against stage 159:
  - `/`: LCP 2.09 s, TBT 253 ms (was 2.08 s and 241 ms);
  - `/app`: LCP 1.31 s, TBT 121 ms (was 1.29 s and 175 ms);
  - CLS at most 0.001.

  The pass doesn't slow phones.

## Next

- **The owner's short phone check:** iPhone zoom on fields, the keyboard with the assistant, notches in landscape, and a real pinch on the plan.
- **Bigger rebuilds the sweep showed,** each its own stage:
  - the visual editor's panels as tabs on a phone;
  - a list view of the trust map, beside its scrollable drawing.
