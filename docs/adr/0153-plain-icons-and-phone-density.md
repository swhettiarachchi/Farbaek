# ADR 0153: Icons that name the action, and denser phone screens

- Status: accepted (2026-11-02). Amends ADR 0008 (White Signal) and ADR 0031 (the showroom's categories).
- Asked for by the owner: the interface had "AI-generated" icons and text, and should feel premium and human-designed on every screen size.

## Context

A platform-wide pass (every route at 320 to 1440px with `pnpm qa:responsive`, the live site and app in the owner's Chrome, and the demo workspace at 375px) found the following.

**Icons:**
- **The sparkle** marked anything to do with AI or building, in 40 places in 16 files. It was on "New build", the Build tab, "Draft with AI", "Ask AI to map each change", the AI models integration, refunds on the pricing page and the showroom's start button.
- **The robot** stood for the agent in 21 places: "Agent inbox", "Fix with the agent", "Propose a change" and the idle Agent Core.
- **The lightning bolt** stood for the agent thinking.
- **The iPhone app** used the "sparkles" SF Symbol in five places, including the Build tab.

These are the stock picture of "AI". They also say nothing about what the control does.

**Copy:** the showroom's categories were slogans: "Websites beyond ordinary", "Luxury, reimagined", "Applications of tomorrow", "Apps for every pocket", "Made to delight".

**Phones:** nothing scrolled sideways, cut off, fell under 44px or logged an error (300 page views). But Mission Control stacked its four number tiles and its recent projects one per row: four tall cards, then four more, about 3,600px of page.

**Honesty:** the homepage's "Image generation" row said "Waiting for Farbaek's separate domain for people's sites to be connected". That has been connected since stage 131. Image generation actually waits for an image model key.

## Decision

**Each icon names its action:**

| Meaning | Icon |
| --- | --- |
| Build (tab, steps, "Start a build like this", "Let the agent build it") | Hammer |
| New build | Plus |
| Agree to the contract | Signature |
| Describe it | Chat text |
| Draft with AI, AI-written notes, "AI noted" | Pen nib |
| Map each change to the contract | Tree structure |
| Agent inbox | Tray |
| Fix with the agent | Wrench |
| Propose a change | Git diff |
| An agent you can steer (homepage) | Steering wheel |
| The AI models integration | Circuitry |
| Failed attempts given back | Counter-clockwise arrow |
| The kept prompt on sign-in | Quotes |
| Generate image | Image |
| Try a failure | Flask |
| The Agent Core, idle | Dashed circle ("Ready for a task") |
| The Agent Core, thinking | Chat dots |
| A plan being written | A turning notch, as the core uses when working |
| Verification started by autonomy | Lightning, as on the autonomy settings |

In the iPhone app:
- Build is `hammer`;
- "Plan it" is `arrow.up`, like the web's send arrow;
- plans are `rectangle.stack`;
- "Build from one sentence" is `text.bubble`.

The words still say "AI" wherever AI does the work (ADR 0009). Only the picture changes.

`tests/design/plain-icons.test.ts` fails on Sparkle, MagicWand, Robot, Brain or ShootingStar icons in `src/app` and `src/components`, and on sparkles, wand or brain symbols in the iPhone app.

**Showroom categories name the subject:**

| Concept | Category |
| --- | --- |
| Typeset Foundry | Type foundry |
| Maison Ore | Luxury retail |
| Afterglow | Film festival |
| Halo One | Product launch |
| Northlight | Research |
| Tally | Shared expenses |
| Kumo | Habits and wellbeing |
| Orbit Clinic | Clinic bookings |

**Denser phone screens:**
- Number tiles (`StatTile`) sit two to a row on phones, with a little less padding and a 28px figure (32px from `sm` up). This applies on Mission Control, the project graph's analytics and the admin overview.
- Mission Control's recent work is a swipeable rail on phones: snap points, the next card peeking in, and the same grid from `sm` up.

**Each "Turning on" capability says what it's waiting for:** the sites domain, app previews or the image model, read from the same configuration as its status.

## Consequences

- Office Space's CPU icon (models, sandbox sizes) stays: there it means actual compute.
- The product films were recorded with the old sidebar. They show the sparkle until they're recorded again (`pnpm films:record`).
