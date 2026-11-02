# Stage 133: Icons that name the action, and denser phone screens

- **Branch:** `design/human-icons-mobile`.
- **Migration:** none.
- **ADR:** 0153. It amends ADR 0008 and ADR 0031.

## 2026-11-02

### Asked

The owner asked for a deep check of every page: remove the "AI-generated" icons and text, and make the interface premium and human-designed on phones and desktops.

### Checked

- **Every route at six widths:** `pnpm qa:responsive` ran on the demo workspace at 320, 375, 414, 768, 1024 and 1440px, 300 page views. Nothing scrolled sideways, cut content off, had a target under 44px or logged an error. That was the baseline before any change.
- **The live site and app in the owner's Chrome:** Mission Control, the homepage end to end, and the page text.
- **Phones at 375px in the demo workspace:** Mission Control, Build, a project, a task, More, and the homepage showroom.
- **A scan of the code** for stock AI icons, filler words, emoji and em dashes.

### Found

- **Stock AI icons:**
  - the sparkle (40 uses in 16 files) on New build, the Build tab, drafting, mapping, the AI models integration and the showroom;
  - the robot (21 uses) for the agent;
  - lightning for the agent thinking;
  - "sparkles" in five places in the iPhone app.
- **Slogan categories** in the showroom: "Websites beyond ordinary", "Applications of tomorrow", "Made to delight" and five more.
- **The rest of the copy was already plain:** no filler words, emoji or em dashes in the interface.
- **A wrong reason on the homepage:** "Image generation: Turning on" said it was waiting for the sites domain, which has been connected since stage 131. It actually waits for an image model key.
- **Long phone pages:** Mission Control stacked four number tiles and four project cards one per row, about 3,600px.

### Done

- **Icons:** every sparkle, robot and thinking-lightning was replaced with an icon for the action (the table in ADR 0153): hammer for build, plus for new, pen nib for drafting, tree for mapping, tray for the inbox, wrench to fix, git diff to propose, and steering wheel for the agent you steer. The iPhone app uses `hammer`, `arrow.up`, `rectangle.stack` and `text.bubble`.
- **`tests/design/plain-icons.test.ts`** keeps them out, on the web and in the iPhone app.
- **Showroom categories** name the subject: Type foundry, Luxury retail, Film festival, Product launch, Research, Shared expenses, Habits and wellbeing, Clinic bookings.
- **Phones:**
  - number tiles sit two to a row, with a slightly smaller figure;
  - recent work on Mission Control is a swipeable rail with the next card peeking in;
  - from `sm` up, both are the same grid as before.
- **Each "Turning on" capability says what it's waiting for:** the sites domain, app previews or the image model.
- **CLAUDE.md and the farbaek-ui skill** carry the icon rule.

### Verified

- `pnpm typecheck`.
- ESLint on every changed file.
- `vitest`: `tests/design`, `src/content` and `src/components`, 28 files and 229 tests.
- **A demo build at 375px and on desktop:**
  - the rail snaps, with the next card peeking in;
  - the tiles sit two to a row;
  - the tray, hammer, plus and dashed-circle icons show;
  - each "Turning on" row gives its own reason.

  Mission Control on a phone went from 3,588px to 2,652px.
- **`pnpm qa:responsive` on the changed build:** 250 page views at 320, 375, 768, 1024 and 1440px, all clean.

### The films, recorded again (a second pull request)

- **All six product films** and their silent loops were recorded again from the film stage: the build and proof films (landscape and portrait) and the four close-up clips. They now show "New build" with a plus and Build with a hammer. Only the videos, loops and posters changed; captions and chapters are the same.
- **The plan clip's sample label** covered "Approve and build", where the camera ends. In clips, the label now sits bottom right, which stays clear in all four.
- **A broken sentence** on the approve card, "a step that might is stopped before it starts", now reads "a step that would go over it is stopped before it starts". The films show the real card, so the plan clip and the build film were recorded after the fix.
- **Checked:**
  - stills of the build film and every clip poster;
  - `src/content` and `tests/design` (12 files, 156 tests), including the films manifest and size budgets.

### Next

- **Image generation** shows "Turning on" until an image model key (`GEMINI_API_KEY`) is set on the server. It's a paid Gemini model, so that's the owner's call.
