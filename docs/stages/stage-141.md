# Stage 141: Premium by default

- **Branch:** `feat/premium-by-default`.
- **Migration:** none.
- **ADR:** 0156.

## 2026-11-03

### Asked

The owner wants everything Farbaek builds to be:
- 3D and animated;
- futuristic, modern, premium, exclusive and high end;
- mobile friendly;
- at the level of the best commercial sites (they named shopify.com);
- clearly made by people, with no AI-looking text or icons;
- full of real-looking images and video from the start, which the person can change at any time.

### Done

**Farbaek Scenes** (`public/kit/scenes/v1/scenes.js`)
- A hosted ES module with six procedural WebGL scenes:
  - aurora (northern-light curtains with rays and stars);
  - glass (a turning glass knot with dispersion over lines it bends);
  - particles (a sphere breathing into a ring);
  - horizon (a line landscape to a glowing horizon);
  - orb (a pearl planet with an atmosphere, rings and moons);
  - gallery (the section's own images on a curved arc).
- A site uses it with markup only. Colours come from the page's CSS variables.
- **Guards:**
  - a still first;
  - no WebGL under reduced motion, Save-Data, weak devices or without WebGL;
  - pauses off screen and in hidden tabs;
  - the pixel ratio is capped at 1.5 on touch screens;
  - cameras fit narrow screens;
  - the gallery loads only https, inline images or the site's own paths.
- Every scene loops seamlessly.

**The media library** (`public/media/v1`)
- 15 loops: aurora, glass, particles, horizon and orb, in signal, ember and pearl.
- Each is 10 s, silent, 0.4 to 1.6 MB, with WebP stills at 16:9 and 4:5. The library is 15 MB in all.
- They're rendered from the kit by `scripts/media/record.mjs`, on this PC's GPU through ANGLE, encoded with the bundled ffmpeg and tuned to budget.

**Real stand-in photos** (`src/core/media/photos.ts`)
- About 80 Unsplash photos served by Lorem Picsum by id.
- I looked at each on contact sheets and sorted it into eleven subjects, from workspace and food and drink to city, coast, people and night.

**Media slots and Studio**
- Every image, video and scene a build adds carries `data-farbaek-media`, plus `data-farbaek-placeholder` while it's a stand-in.
- In Studio (`media-replace.tsx`, the visual editor):
  - **"Media on this page"** lists the slots with a Placeholder mark (icon, words, dashed edge).
  - **Replace** works for an image from:
    - your images;
    - real photos by subject and shape;
    - 3D art from the library;
    - a link.
  - For a video it works from the library or a link.
  - **3D scene** switches a scene.
- The edit core (`visual-edit.ts`) checks every address. Only these are accepted:
  - https;
  - the project's own images;
  - the library's own files.
- Video paths are refused, since projects can't hold video.
- The placeholder mark stays for library files and stand-in photos, and comes off for the person's own image or link.
- The project page says how many stand-ins remain, above the publish panel.

**Studio standard v2** (`studio-standard.ts`)
- The bar is the polish of the best commercial sites, reached with each brand's own look.
- **Human-made rules:**
  - no AI phrasing (a named list);
  - one icon family that names things, never sparkles, wands, robots, brains or rockets;
  - no emoji in headings or buttons;
  - real-feeling details and editorial asymmetry.
- **On every site:** a 3D signature, choreographed motion, media slots, video done right, phone speed, and no CSS filters.
- **Honesty:** the agent can't generate images; people can, on the Files page.
- The plan drafter knows the kit and library are allowed, so it doesn't ask about them.

**Skills**
- Motion, 3D and brand identity are ticked by default for anything people will see, plus "Flagship site craft" for a website.
- New skills: "Flagship site craft", "Luxury and editorial" and "Video and media".
- "3D and depth" now leads with Farbaek Scenes.
- The homepage says "Eleven built-in design skills", and the design line now names the 3D moment, motion and replaceable media.

**"Flagship site craft", from a study of shopify.com**
- At the owner's request I went through shopify.com section by section in Chrome, with screenshots and its page text. The skill turns what makes it work into patterns, in Farbaek's own words:
  - a hero like a film still (real media, a two-line headline, one solid pill and one quiet one, navigation over it);
  - a rotating word when it shows range;
  - two-tone section openers;
  - colour-block sections joined by large rounded top corners;
  - sticky story cards whose visual steps through states;
  - real product UI and real customers (a labelled marquee, photo stories with one bold result, a quote card over a photo);
  - huge light numerals with a label, an accent rule and a source;
  - feature trios with their own visuals;
  - a small floating video teaser;
  - a real three-step start, then a dense footer.
- It's carried out in each brand's own look and copies nothing.

**`review_site`**
- **Must fix:**
  - video that phones won't autoplay, or with no poster or accessible name;
  - video file paths;
  - unknown scenes, or a scene without the kit;
  - CSS filters;
  - AI-sounding copy;
  - emoji in headings, buttons and links.
- **To consider:** cliché icon names, a second autoplaying video, and the placeholders left.

**Headers and the preview**
- `/kit` and `/media` are served with CORS and CORP cross-origin. Media is cached as immutable; the kit for a day.
- The preview's CSP adds Farbaek's own origin for scripts, images and media.
- `NEXT_PUBLIC_KIT_ORIGIN` points both at a local server for tests.
- The threat model and current state are updated.

### Verified

- `pnpm typecheck`.
- ESLint on every changed file.
- `vitest` on `src/core`, `src/content`, `src/server/ai`, `tests/kit` and `tests/design`: 134 files and 1,067 tests at that point. The suite was run again in full before the commit.
- New tests:
  - the kit's helpers (colours, gating, the pixel ratio, options, safe image addresses, the looping phase);
  - every library file present, within budget and matching the manifest;
  - the colourways matching the recorder;
  - the photo catalogue;
  - media and scene edits, including refused addresses;
  - the new `review_site` rules;
  - the skill defaults and budget;
  - the standard's content;
  - the preview CSP.
- **The scenes in a browser** (a local test page), dark and light, at 1280 px and 375 px:
  - each scene runs with no console errors;
  - no sideways scroll;
  - aurora, glass, particles and orb were tuned until they looked right.
- **Recorded loops:** I looked at frames from the particles loop (CRF 34) and the ember glass loop.
- **Studio in a production demo build**, with a temporary static demo site and a local kit origin, both removed afterwards:
  - the media list reads "Media on this page (3, 2 to replace)";
  - Replace on the photo opens on Real photos and puts photo 30 in at 1600×900, keeping the alt text and the placeholder mark;
  - Replace on the video by link puts the new source in with `type="video/mp4"` and removes the mark;
  - the scene switches to glass;
  - the preview CSP lists the kit origin.
- **Not checked here:**
  - **The scene and library video inside Studio's preview frame.** A sandboxed preview frame can't fetch from `http://localhost` at all: the import fails even with no CSP, while jsDelivr loads. So this waits for production's https origin, after the merge.
  - **Picking a library file in Studio.** It failed locally for the same http reason, and is fixed by trusting the library's own addresses (covered by the rules).
  - **A real build by the agent with the new standard.**

### Next

- **After the merge:**
  - check `https://www.farbaek.com/kit/scenes/v1/scenes.js` and a loop on production (206, CORS, cache);
  - check a scene inside Studio's preview;
  - start a real build from the first screen.
- **Stage 142, real subject photos and video:**
  - Pexels search (free, needs the owner's API key);
  - the person's own video uploads;
  - an agent tool for image generation.
- **Stage 143:**
  - a screenshot-based design review;
  - the templates rebuilt on the kit;
  - skills for the desktop agent.
