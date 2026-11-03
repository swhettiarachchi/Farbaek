# Stage 142: Premium by construction (the Studio kit)

- **Branch:** `feat/studio-kit`, stacked on `fix/agent-site-check`.
- **Migration:** none.
- **ADR:** 0157.

## 2026-11-03

### Asked

- A real build on production (Sunrise Bakery, opening hours) came out as a plain site.
- The owner asked again for every site to be 3D, animated, premium, luxury and exclusive, at shopify.com's level or above.
- Paid plans should unlock more premium kit options.

### Why builds came out plain

- **The starter:** new sites began from a neutral starter (system fonts, bracketed copy, no Scenes, no media).
- **The model:** Free writes with Claude Haiku.
- **No shared kit:** every build wrote its CSS from scratch.
- **The review:** `review_site` only looked for broken things.
- **Older sites:** they had no path up.

### Done

- **The Farbaek Studio kit** (`public/kit/studio/v1/studio.css` and `studio.js`):
  - five looks;
  - brand tokens;
  - premium sections: glass nav with phone menu, cinematic, centred and split heroes, split features, stats, a card mosaic, quotes, FAQ, CTA and footer;
  - motion attributes for reveals (up, scale, mask, words), stagger, count-up and 3D tilt.

  It sits in one cascade layer, so a site's CSS wins. There are no filters and no scroll listeners, every animation sits behind reduced motion, and a failsafe shows content if the script never runs.
- **Studio kit Pro** (`studio-pro.css` and `studio-pro.js`), on every paid plan as the new `studio_kit_pro` feature:
  - three more looks;
  - story chapters with a sticky stage;
  - a peeking carousel with pause;
  - a marquee;
  - a pinned horizontal gallery;
  - a closer-look turntable;
  - magnetic buttons, a pointer spotlight and depth layers;
  - rising headlines and page transitions.

  It's listed on Pricing and Billing, and the plan card says what it adds. Free gets the full core kit and an honest line about Pro.
- **The agent's prompt:**
  - a compact kit reference by tier (`src/core/media/studio-kit.ts`), after the Studio standard;
  - the tier comes from the workspace plan when runs start from the plan card, Build or the phone apps;
  - the standard now says every static site starts from the kit, and an existing site keeps its design unless asked;
  - the run's first note names the kit.
- **The premium starter:**
  - the aurora look, Bricolage Grotesque and Geist;
  - a Scenes hero with a library still;
  - a split story with a library video;
  - stats, a mosaic of sorted real photos, a sample-labelled quote, FAQ, CTA and footer.

  Every stand-in is a placeholder slot. The drafting brief says to keep the kit and rebrand everything.
- **`review_site`** now asks for:
  - a 3D moment (fix);
  - motion (fix);
  - images or video (consider);
  - a real font pairing (consider);
  - both kit files together (consider).

  Its tool description is up to date.
- **Upgrade its design:** a one-click suggestion on the project page of a static site that doesn't use the kit. It fills the follow-up box with an upgrade brief, and the person still approves the plan.
- **On the base branch (`fix/agent-site-check`):**
  - the agent no longer stops a run to ask a person about `farbaek check-site`;
  - the finish tool states its 2,000-character limit.

  Both were found on a live run today.

### Verified

- **`tests/kit/studio.test.ts`:**
  - size budgets;
  - no filters;
  - animations only behind reduced motion;
  - no scroll listeners;
  - one cascade layer;
  - every class and attribute in the agent's reference exists in the kit;
  - the count, split, turn and magnet helpers;
  - every paid plan gets Pro and Free doesn't;
  - Pro text appears in the prompt only for the pro tier.
- **Other unit tests:**
  - the review's new checks;
  - a kit site with a scene is clean;
  - the starter's review leaves only its placeholders.
- **Test suites:** vitest on `src/core`, `src/content`, `tests/kit`, `tests/design`, `src/agent-runtime`, `src/server/cloud-agent`, `src/server/workspace` and `src/components`: 184 files, 1,429 tests pass.
- **Static checks:** typecheck and eslint are clean.
- **In the browser** (the starter and a Pro sample page served locally):
  - at 1024 px: the aurora hero, story video, mosaic, chapters switching media, the carousel with controls and the marquee all work;
  - at 375 px: no sideways scroll, the phone menu opens and closes with Escape, and the scene's still fills the hero;
  - two fixes came from this: the poster now fills the scene box, and footer links are 44 px.

### Not done, next (stage 143)

- **The ten templates.** They predate the new checks: none has media slots or web fonts, and six have no 3D moment. They need rebuilding on the kit. The test lists these gaps, so it fails once a template is fixed. Until then, a build from a template is told to add them.
- **Pexels photos and video**, which need the owner's free key.
- **A stronger model for Free's first design pass**, which is a cost decision for the owner.
- **Skills and the kit tier in the desktop agent.**
- **Checks still to do on production after the merge:**
  - `curl` the kit files;
  - press **Upgrade its design** on Sunrise Bakery and approve the build;
  - check the result in Studio's preview.
