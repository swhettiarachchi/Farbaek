# ADR 0158: High-end by default: premium starting pages, matched photos and Sonnet for first builds

- Status: accepted (2026-11-03). Amends ADR 0028 (templates), ADR 0021 (routing), ADR 0156 (stand-in photos) and ADR 0157 (the Studio kit).
- Asked for by the owner: every site Farbaek builds must be 3D, animated, premium, luxury and exclusive, look human-made and use real images. After stage 142 the owner's own upgrade of a plain bakery site still came out ordinary.

## Context

The upgrade of Sunrise Bakery on 2026-11-03 (a Free workspace) showed four things:
- **The structure stuck.** The agent kept the old plain page's structure and restyled it. Agents keep the structure they start from.
- **The model was the fast one.** Free writes every step with Claude Haiku.
- **The photo didn't match.** "Milk bread loaf" got a photo of grapes: the sorted stand-in photos (Lorem Picsum) have no bakery pictures.
- **The run stopped early.** It hit its 8% cap after the site review and never fixed what the review found.

## Decision

- **Premium starting pages ("design directions"):**
  - **What they are:** templates rebuilt on the Studio kit at flagship craft, each with:
    - a distinct look and font pairing;
    - a 3D signature;
    - kit motion;
    - real, subject-matched photos in placeholder slots;
    - human sample copy, labelled as a sample;
    - a working feature.
  - **In this change:**
    - **Bakery and café** (`local-business`): Kiln & Crumb, real bread photos, a 3D bake-time ticket, a live "open now" status, a menu filter and the hours;
    - **Hotel, spa and luxury** (`luxury`, new): Halcyon House, a cinematic resort hero, the suites on a Farbaek Scenes gallery arc and an enquiry form that says it doesn't send yet.
  - **To follow:** the store, landing, portfolio and event templates.
  - **Tests:** templates on the kit pass every premium check. Their outside hosts are limited to Farbaek's kit and library, Google Fonts and the sorted photos.
- **The right start, automatically:**
  - `templateForPrompt` maps the kind of business in a website prompt to a direction (food to the bakery and café, hotels, spas, villas, real estate and jewellery to luxury).
  - `startFromPrompt` uses it when no template was chosen. App and API prompts are unchanged.
  - The brief tells the agent to keep a kit template's finish and swap each photo for the closest one of the same kind.
- **Real photos that match:**
  - **Source:** 112 free Unsplash photos (never Unsplash+), found by subject on unsplash.com, each checked to load. They cover 18 business subjects: bakery, café, restaurant, hotel, spa, resort, fashion, clothing, jewellery, homes, events, weddings, devices, studio, still life, salon, fitness and teams.
  - **Use:** they're served from `images.unsplash.com` with crop parameters under the Unsplash License, in `PHOTO_SUBJECTS` beside the Picsum place photos. `photoUrl` and `isPhotoUrl` accept both sources. The agent is told to pick the exact subject, or use a library still rather than an unrelated photo.
- **Sonnet for first builds on Free (the owner's choice):**
  - **When:** a design pass is a project's first task, or the **Upgrade its design** brief (`isDesignPass`).
  - **What changes:** on a plan capped at fast models, writing at Balanced or Deep uses the standard model. Paid plans are unchanged.
  - **How it's set:** on the server, from the plan card and the phone apps.
  - **Who can ask for it:** the gateway honours it only for Farbaek's own cloud runs (`run:`), never for paired agents.
  - **Cost:** the free allowance still bounds it.
- **First builds aren't cut off:** their estimate is a whole site's (2.5 times the steps), and the plan card defaults their cap to **No run cap**, still bounded by the plan's usage.

- **The person chooses light or dark** (the owner's rule, 2026-11-03): a site is never dark by default. The plan card asks **Colour theme for the site: Light or Dark**, light unless the prompt asked for dark (`themeFromPrompt`). The choice goes to the agent's prompt (`themeForPrompt`), which switches an existing site to the chosen theme. The general starter now uses the light signal look and light media.

## Consequences

- A new website starts from finished, high-end structure for its business, so even a fast model ends with a premium site.
- A Free user's first site costs more of their monthly allowance, so they get fewer builds a month, each better.
- Published sites hotlink Unsplash images until the person replaces them, as they already did with Picsum.
- **Next:** rebuild the store, landing, portfolio and event templates as directions, and add their mappings.
