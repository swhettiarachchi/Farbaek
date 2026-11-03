# ADR 0157: Premium by construction: the Studio kit, Studio kit Pro and premium review checks

- Status: accepted (2026-11-03). Amends ADR 0030 (the Studio standard) and ADR 0156 (premium by default).
- Asked for by the owner: a real build on production came out as a plain site. The owner wants every site Farbaek builds to be 3D, animated, premium, luxury and exclusive at shopify.com's level or above, and paid plans to unlock more premium options.

## Context

ADR 0156 raised the standard and added Farbaek Scenes and the media library, but a live build on 2026-11-03 still came out plain. The causes:

1. **New sites started from a deliberately neutral starter.** It used system fonts, `[bracketed]` copy and a stand-in signature, with no Scenes and no media. The agent rebrands the structure it starts from rather than replacing it.
2. **Free writes every step with Claude Haiku**, and text rules alone don't lift a fast model's layouts.
3. **Every build wrote its CSS and JavaScript from scratch.** The ten templates each copied the same reveal and tilt code, but none of it was shared.
4. **`review_site` only checked for broken things.** A page with no motion, no 3D and no media passed clean.
5. **Older plain sites had no way up.** A small follow-up change keeps an existing site's look.

## Decision

- **The Farbaek Studio kit** (`public/kit/studio/v1/studio.css` and `studio.js`, served from `www.farbaek.com/kit/studio/v1/`):
  - **What it has:**
    - five looks on `<html data-fs-look>`: signal, noir, atelier, aurora, bloom;
    - a brand-token contract (`--accent`, `--accent-2`, `--ink`, `--paper`, `--font-display`, `--font-body`, `--radius`);
    - premium sections as `fs-*` classes: glass nav with a phone menu, cinematic and split heroes, split features, stats, a mosaic of cards, quotes, FAQ, CTA band and footer;
    - motion as attributes: `data-fs-reveal` (up, scale, mask, words), `data-fs-stagger`, `data-fs-count` and `data-fs-tilt` (CSS 3D).
  - **How it's built:**
    - all of it sits in one cascade layer, so a site's own CSS always wins;
    - IntersectionObserver only, no scroll listeners and no CSS filters;
    - every animation sits inside `prefers-reduced-motion: no-preference`;
    - a failsafe shows hidden content if the script never runs.
  - **Versioning:** `v1` is frozen once published, like Scenes.
  - **Headers:** the existing `/kit` headers already give it CORS and a one-day cache. The preview CSP allows it (`style-src https:`, and `script-src` already includes the kit origin), and so do published sites.
- **Studio kit Pro** (`studio-pro.css` and `studio-pro.js`):
  - **What it adds:** three more looks (obsidian, chrome, garden), story chapters with a sticky stage, a peeking carousel with pause, a marquee, a horizontal gallery pinned to scroll, a closer-look viewer that turns the product, magnetic buttons, a pointer spotlight, depth layers, headlines that rise word by word, and page transitions.
  - **Who gets it:** a new plan feature, `studio_kit_pro`, is on every paid plan (Lite and up), and so on the trial. The files are public like any stylesheet; the gate is what the agent is told and allowed to use, decided on the server from the workspace's plan.
  - **What Free sees:** Free builds get the full core kit and one line saying Pro is for paid plans. Free is never made worse.
- **In the agent's prompt:**
  - `kitForPrompt(tier)` (`src/core/media/studio-kit.ts`) is a compact reference of classes and attributes. It's appended after the Studio standard in `agentSystemPrompt`.
  - Each tier's text is a constant, so prompt caching holds.
  - The standard says every static site starts from the kit. An existing site that doesn't use the kit keeps its design unless the task asks to change the look.
  - Runs started from the plan card, Build and the phone apps pass the tier. Workflow runs and the desktop agent use the core kit.
- **The premium starter:** the static-website starter is rebuilt on the kit:
  - the aurora look and a Google Fonts pairing;
  - a Scenes hero with a library still as its poster;
  - a split story with a library video;
  - stats, a mosaic of sorted real photos, a quote marked as a sample, FAQ, a CTA and a footer.

  Every stand-in is a placeholder slot. The plan-drafting brief tells the agent to keep the kit and rebrand everything else.
- **`review_site`** now asks for what makes a site premium, when the project has an `index.html`:
  - **fix:** no 3D moment anywhere (no Scenes box, three.js, CSS 3D, `data-fs-tilt` or turntable);
  - **fix:** nothing moves (no transitions, animations or kit reveals);
  - **consider:** no images or video;
  - **consider:** only system fonts;
  - **consider:** the kit's stylesheet without its script, or the reverse.

  A site on the kit skips the "no responsive rules" check. The ten templates don't meet the new checks yet (no media slots or web fonts, and six have no 3D moment). Rebuilding them is stage 143; until then a build from a template is told to add these.
- **Upgrade its design:** the project page of a static site that doesn't use the kit offers a one-click follow-up. It fills the composer with an upgrade brief: keep the words, pages and features, and rebuild the look on the kit. The person still approves the plan.
- **Also fixed:** the agent no longer asks a person to run `farbaek check-site`. That command is Farbaek's own check, run at verification, and the agent is pointed to `review_site` instead. The finish tool also states its 2,000-character summary limit.

## Consequences

- Builds start from premium structure instead of inventing it, so a fast model's output is premium too. The kit is the cost-neutral lever: Free's model doesn't change.
- Published sites depend on `www.farbaek.com/kit/studio/v1/`. It's versioned and never changed in place.
- **Not done here (stage 143):**
  - the templates rebuilt on the kit;
  - Pexels photos and video (needs the owner's key);
  - a stronger model for Free's first design pass (a cost decision for the owner);
  - skills and the kit tier in the desktop agent.
