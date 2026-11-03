# ADR 0156: Premium by default: Farbaek Scenes, the media library and media people can replace

- Status: accepted (2026-11-03). Raises the Studio standard of ADR 0030; builds on images in projects (ADR 0108) and the visual editor (ADR 0118).
- Asked for by the owner: every site, app and piece of software Farbaek builds should be 3D, animated, futuristic, premium, exclusive and mobile friendly, at the level of the best commercial sites (the owner named shopify.com), look made by people rather than AI, and come with real-looking images and video the person can change at any time.

## Context

Until now the agent's design came from the Studio standard plus up to three skills suggested by keyword, so motion and 3D applied only when a prompt happened to say "animated" or "3D". Each build wrote raw three.js from scratch. The standard said no image generator was connected (ADR 0109 has since added one, for people on the Files page), so stand-in photos were random `picsum.photos/seed` images whose subject never matched the business. Nothing tracked them, Studio could only change an image's alt text, and video didn't exist in builds at all.

Projects store only images (2 MB each, in Postgres), so a build can't carry video or 3D model files. The static preview allows scripts only inline and from jsDelivr, unpkg and cdnjs, and blocks fetch. Production already serves Farbaek's own `public/` files with Range requests (the films, ADR 0051), so phones can play video from there.

## Decision

- **Farbaek Scenes** (`public/kit/scenes/v1/scenes.js`, served as `https://www.farbaek.com/kit/scenes/v1/scenes.js`):
  - **What it is:** one ES module with six procedural WebGL scenes: aurora, glass, particles, horizon, orb and gallery. three.js is pinned at 0.186.1 and loaded from jsDelivr only after gating. There are no model files, so the scenes work in the fetch-free preview.
  - **How a site uses it:** markup only (`data-farbaek-scene`). Colours come from the page's CSS variables or `data-palette`.
  - **Guards:**
    - a still comes first;
    - no WebGL under reduced motion, Save-Data, fewer than 4 cores or under 4 GB of memory (the rules of ADR 0052), or without WebGL;
    - scenes pause off screen and in a hidden tab;
    - the pixel ratio is capped at 1.5 on touch screens and 2 elsewhere.
  - **Loops:** every scene is a function of a looping phase, so it repeats seamlessly.
  - **Versioning:** the path is versioned; a breaking change goes to `v2`. The kit is cached for a day so fixes reach sites.
- **The media library** (`public/media/v1/<id>/`):
  - **What's in it:** 15 items, five scenes in three colourways (signal, ember, pearl). Each has a 10 s silent loop (1280×720 H.264, at most 1.65 MB) and WebP stills at 16:9 and 4:5.
  - **How it's made:** rendered from the kit by `scripts/media/record.mjs` (its own stage server, frame stepping, the bundled ffmpeg, CRF tuned to the budget). That makes every file Farbaek's own and free to use in any build.
  - **Caching:** immutable, and never re-recorded into `v1`.
  - **Records:** the catalogue lives in `src/core/media/library.ts`, and a test checks every file against its budget.
- **Real stand-in photos** (`src/core/media/photos.ts`):
  - about 80 Unsplash photos served by Lorem Picsum by fixed id (free under the Unsplash License, no attribution needed);
  - each was looked at and sorted by hand into eleven subjects (workspace, food and drink, people, city, and so on);
  - so a café gets a café, not a random landscape.
- **Media slots:**
  - Every image, video and scene a build adds carries `data-farbaek-media="<slot>"`, and `data-farbaek-placeholder` while it stands in for the person's own.
  - **Studio's Replace** sets an image's or video's source from:
    - the project's images;
    - the real photos;
    - the library (3D art or loops);
    - an https link.
  - It also switches a scene.
  - Each edit is checked like any visual edit: https or a project image only, and no video paths, since projects can't hold video.
  - The placeholder mark stays for library files and stand-in photos, and comes off for the person's own image or link.
  - The project page says how many stand-ins remain before publishing. This is a notice, not a block.
- **Studio standard v2** (`src/core/agent/studio-standard.ts`):
  - **The bar:** the polish of the best commercial sites, reached with each brand's own look and never copied.
  - **Human-made rules:**
    - copy without AI phrasing;
    - one icon family that names things, never sparkles, wands, robots, brains or rockets;
    - no emoji in headings or buttons;
    - real-feeling specifics.
  - **On every site:** a 3D signature (Farbaek Scenes first), choreographed motion, and media slots filled from the person's images, then the library, then real photos by subject.
  - **Video:** muted inline loops with posters, one at a time.
  - **Phone speed:** a still first, LCP under 2.5 s, no CSS filters (ADR 0055).
  - **Honesty:** the agent can't generate images; the person can, on the Files page.
- **Skills:**
  - Motion and interaction, 3D and depth, and Brand identity are ticked by default for anything people will see (not an API with no pages), plus Flagship site craft for a website. People can untick them.
  - Up to two more are suggested.
  - New skills: Flagship site craft; Luxury and editorial; Video and media.
  - 3D and depth now leads with Farbaek Scenes.
  - **Flagship site craft** came from studying shopify.com closely at the owner's request (2026-11-03): how its hero, type, section rhythm, story cards, proof and numbers work. The skill states those as patterns in Farbaek's own words, carried out in each brand's own look. It copies no layout, colours, copy or assets.
  - The same day, studies of nordstrom.com and princesspolly.com rewrote **Shop and product pages**. It now covers the promo bar and header, the editorial home, product cards, filters, the product page, the bag drawer and one designed sign-up moment, and keeps urgency honest: no invented reviews, viewer counts, stock counts or countdowns.
  - A study of apple.com added **Product storytelling**: one idea per screen, a sticky product bar, a giant claim with a price chip, scroll-driven chapters, a closer-look viewer, scannable specs with footnoted claims, and peeking carousels.
- **`review_site`** adds:
  - **fix:**
    - autoplay without `muted` and `playsinline`;
    - a video without a poster or an accessible name;
    - a video file path, since projects can't hold one;
    - an unknown scene, or a scene without the kit;
    - CSS `filter`;
    - AI-sounding phrases;
    - emoji in headings, buttons and links;
  - **consider:**
    - icons named like AI clichés;
    - more than one autoplaying video;
    - the placeholders that remain.
- **The preview's CSP** adds Farbaek's own origin to `script-src`, `img-src` and `media-src`. Nothing else widens.
- **CORS:** `/kit` and `/media` are served with `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin`, because module scripts and WebGL textures load across origins.
- **Local builds:** `NEXT_PUBLIC_KIT_ORIGIN` points the kit and the library at a local server, and only a bare origin is accepted.

## Consequences

- Published sites depend on www.farbaek.com for their 3D moment and library media. If it's unreachable, the still and the poster still show. The VPS serves this bandwidth; Cloudflare caching is the next step if it grows.
- Stand-in photos load from picsum.photos and Unsplash's CDN. They're placeholders, flagged until replaced.
- The repository grows by about 15 MB of library media.
- Still to come:
  - **Subject photos and video by search:** Pexels, free with an API key only the owner can create.
  - **The person's own video uploads:** storage outside Postgres, Range on published sites.
  - **An agent tool for image generation.**
  - **A screenshot-based design review.**
  - **The templates rebuilt on the kit.**
  - **Skills for the desktop agent.**
