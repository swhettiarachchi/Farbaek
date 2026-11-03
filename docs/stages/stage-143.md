# Stage 143: High-end by default

- **Branch:** `feat/high-end-default`.
- **Migration:** none.
- **ADR:** 0158.

## 2026-11-03

### Asked

The owner's upgrade of Sunrise Bakery on production (Free, Haiku) was better but still ordinary:
- the old structure stayed;
- the bread got a grape photo;
- the run stopped at its cap.

The owner repeated the bar: 3D, animated, premium, luxury, human-made, real images.

The owner chose: on Free, the first build and design upgrades are written by Sonnet.

### Done (part 1)

- **Two premium directions on the Studio kit,** written to flagship craft:
  - **Bakery and café** (`local-business`, Kiln & Crumb):
    - a real bread hero;
    - a tilting "out of the oven at" ticket;
    - a live open-now status from the hours;
    - a stats strip;
    - a story split;
    - a mosaic of real bakery photos;
    - a filterable menu in rupees;
    - a quote, the visit section with the hours and today marked, questions, a cake-order call and a footer.
  - **Hotel, spa and luxury** (`luxury`, new, Halcyon House):
    - a cinematic resort hero that drifts;
    - the suites on a Farbaek Scenes gallery arc;
    - suite cards with sample rates;
    - spa and dining splits;
    - a quote;
    - an enquiry form that checks itself and says it doesn't send yet;
    - an offer and a footer.
- **Automatic directions:** a website prompt about food starts from the bakery and café; one about hotels, spas, villas, real estate or jewellery starts from luxury.
- **Photos:**
  - 112 free Unsplash photos in 18 business subjects, each checked to load;
  - Picsum place photos are kept;
  - Studio's Real photos tab lists them all;
  - the agent is told to match the subject exactly.
- **Sonnet for first builds on Free:**
  - routing, the gateway (cloud runs only), the executor, the plan card and the phone apps;
  - the plan card says so;
  - first builds estimate a whole site and default to no run cap.

### Verified

- **Tests:** vitest on `src/core`, `src/content`, `tests/kit`, `tests/design`, `src/agent-runtime`, `src/server` and `src/components`, 265 files and 1,968 tests, all pass. New tests cover:
  - routing with a design pass;
  - the gateway refusing it for paired agents;
  - the direction mapping and first-build rule;
  - the whole-site estimate;
  - photo addresses;
  - template hosts and premium checks;
  - bakery and villa prompts starting from their directions.
- **Static checks:** typecheck and eslint are clean.
- **In the browser** (served locally with the kit):
  - the bakery page at 1280 and 375 px, with no sideways scroll and no small targets;
  - the luxury hero, the 3D suites arc and the suite cards.
- **Fixes found in the browser:**
  - darker left edges behind hero text;
  - the ticket's float separated from its tilt;
  - the fanned suite photos hidden while the arc runs.

### Light or dark is the person's choice

- The owner saw the upgraded Tip calculator come out dark and set the rule: never dark by default, ask.
- The plan card now asks **Colour theme for the site: Light or Dark**. It's light unless the prompt asks for dark. The agent follows the choice and switches an existing site to it.
- The general starter is light (the signal look, pearl scene and video).
- Tests: the theme helpers, and that the prompt carries the choice.

### Next (part 2)

- Rebuild `online-store`, `landing-page`, `portfolio` and `event-page` as directions, and add their prompt mappings.
- **After the merge, on production:** a bakery prompt should start from Kiln & Crumb, and the plan card should say Sonnet with no run cap.
