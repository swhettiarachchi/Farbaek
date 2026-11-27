# Stage 287: one list of places, in every frame

- **Date:** 2026-11-27
- **Branch:** `feat/stage-287-one-sidebar`, from stage 286's branch (merged as #343 while this one was being built)
- **Decision:** ADR 0295 (one list of places, in every frame)
- **Part of:** the briefs' one navigation; item 8 in the order of work. It makes the list one. One sidebar component for the app's frame and Chat's is still to do.
- **Migration:** none. **New dependency:** none. **New paid service:** none.
- **Skills used:** `farbaek-ui`, `farbaek-human-made` and `premium-app-ui` (one list, rows where there is room and icons where there isn't, touch sizes, both looks); `ui-ux-pro-max` (navigation hierarchy, predictable places, touch targets and spacing); `audit-suite` checks through the project's own responsive and accessibility audits.

## Why

Five pieces of navigation each kept a list of the places, and they had drifted apart: the studios' switcher had no Build, Chat's sidebar had no Projects or Approvals, and Build's workspace had a third version in its header. The four frames were captured side by side first, on a wide screen and a phone.

## What was built

- **One list, `PLACES`, and one component, `PlacesNav`,** in `src/components/app/app-nav.tsx`: Home, Chat, Images, Video, Build, Projects, Scheduled, Approvals, with the count of waiting approvals.
- **The app's sidebar** draws it as rows, as before.
- **Chat's sidebar and its phone drawer:** Home and the four spaces as rows, then Projects, Scheduled, Approvals and More as a strip of icons. Folded, the sidebar shows the same list as a rail.
- **The studios and Build's workspace, on a wide screen:** the list as a rail of icons at the left (`PlacesRail`). Their header switchers are gone; the workspace's header names the project.
- **A studio's phone drawer** leads with the list, then the library, and scrolls as one with its Close kept in place.
- **The counts reach every frame** from the signed-in layout (`NavCountsProvider`): approvals on their place, and the unread mark on More where Help is behind it.
- **One rule for which place is lit** (`placeLit`): Build's workspace and a plan's own page are Build.

## What a person no longer has to do

- Go home from a studio to reach Build, or from Chat to see that a change is waiting for them.

## Verified

- **Tests,** new unless said:
  - `components/app/app-nav.test.ts` (4 new, 13 in all): the list and its order; exactly one place lit on each of its pages; Build's workspace and a plan's own page count as Build; no place lit on a page that isn't one.
  - `tests/design/one-navigation.test.ts` (3): no other file writes the list out; every frame draws the shared component, Chat twice; no header keeps a switcher of its own.
  - The whole suite, run after the last change: 5,569 passed, 21 skipped (as before), none failed.
- `tsc --noEmit` with a 4 GB heap, and `pnpm lint`: clean.
- **`pnpm build`:** passed after the last change, with the 4 GB heap.
- **The project's own audits,** on the running demo:
  - `qa:responsive --strict` on Chat, the image studio and Build's workspace at 375 and the touch-tablet widths 1024, 1180 and 1366: no sideways scroll, no small targets, no lost taps.
  - `qa:a11y` on Home, Chat, both studios, the workspace and Build's start at 1280 and 375: no findings.
- **Measured in the demo:** a row is 40 px with a mouse, 44 px on a touch tablet and 48 px in a touch phone's drawer; icons are 40 px circles 8 px apart; the rail's way home is 44 by 44 px; on a short screen the rail scrolls.
- **Looked at in the demo workspace,** at 1280 and 390 px, light and dark: the four frames before and after; Chat's sidebar with its conversations back in view; a studio with its rail; the workspace in Dark with its rail and Build lit; a studio's phone drawer; Chat folded to its rail. From a studio's drawer, Build opened Build's start.
- **A fresh review** of the change by a separate agent, after every check had passed. Eight real things, all fixed:
  1. the rail's way home was 23 px wide;
  2. icons 4 px apart let two touch areas overlap;
  3. a row was 44 px, not 48, on a touch phone, because of the order Tailwind writes its variants in;
  4. these notes did not exist yet;
  5. the workspace had two links named Projects, to two pages, on a wide screen;
  6. a studio's phone drawer scrolled its Close away;
  7. the test that keeps the list one could pass with Chat's rows written out by hand;
  8. the count of replies was carried and never shown.
- **An older fault the audit found,** fixed here: Chat's conversation rows were 44 px on touch, so the touch areas of two rows' action buttons overlapped by 2 px. They are 48 px.
- **Not verified:**
  - **A real phone, and 200% text.**
  - **The owner's verdict** on the rail and the strip of icons: they are icons without words.
  - The unread mark on More: no sample has an unread reply, so it was not seen on a screen.

## Next

- After the merge: look at the four frames on production.
- A Research page: everything a person has researched, findable again.
- One sidebar component for the app's frame and Chat's.
