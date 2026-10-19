# 0030. The Farbaek Studio standard and skills

- Status: accepted
- Date: 2026-10-19
- Source: the owner's "Farbaek Premium Website & App Generation Standard" (19 Oct 2026)

## Context

The owner set the bar for what Farbaek builds for people. Every site or app must:
- look premium, modern and distinctive;
- use purposeful motion, and 3D where it helps;
- never look generic or "AI-built";
- be complete and working, so users see that Farbaek, and its paid plans, are worth it.

The owner also asked for skills: built-in design intelligence, compatibility with Claude Skills and taste-skill-style skills, and the user's own skills, applied together with conflicts resolved.

Until now the agent's instructions covered safety and the contract, but nothing about design, so its output depended on the model's defaults.

## Decision

**The Studio standard** (`src/core/agent/studio-standard.ts`) is part of the agent's instructions on every run, cloud and desktop. It covers how anything people see is designed and built:
- **Read the brief first.** Write `DESIGN.md`: the design read, a named palette with one accent, a type pairing, the layout, one signature element and the motion plan.
- **Avoid the usual AI tells.** The list is drawn from taste-skill: the purple glow, a centred hero over a mesh, three equal cards, eyebrows everywhere, fake screenshots, filler verbs, em dashes.
- **Craft:** real hierarchy, and motion with a purpose, always with a reduced-motion fallback.
- **3D and depth** where they tell the story, with libraries pinned on jsDelivr, unpkg or cdnjs.
- **Honest visuals.** No image generator is connected, so photo placeholders are marked and listed.
- **Real, specific content,** with plausible sample values labelled as samples.
- **Complete, working, accessible pages,** checked before finishing.

The plan drafter puts `DESIGN.md` in scope for visible builds.

**Skills** (`src/core/agent/skills.ts`) use the SKILL.md format of Claude Skills: frontmatter with a name and a description, then instructions. A skill comes from one of two places:
- **Built-in** (`src/content/skills`): seven skills, covering motion and interaction, 3D and depth, brand identity, shop and product pages, software product site, portfolio and personal, and app and dashboard UI. They're suggested from the plan and chosen on the plan card.
- **The project's own:** any `.farbaek/skills/<name>/SKILL.md` or `.claude/skills/<name>/SKILL.md` in its files, loaded on every run. At most 5 are loaded, with size limits.

**Precedence** is stated in the instructions:
1. the contract and safety rules;
2. the Studio standard;
3. skills, with the project's own last, so they win a conflict between skills.

**What a skill can't do.** Only a skill's text is used. It can't widen the contract, grant tools or run scripts, and the instructions say to ignore any part that tries. This is the adapter: incompatible parts of other skill formats are ignored rather than claimed as supported.

**Previews can run pinned libraries.** The preview CSP allows scripts from jsDelivr, unpkg and cdnjs. The frame stays sandboxed, with no same-origin access and no `connect`.

## Consequences

- **First live build to the standard** (Volt Ride, an e-bike rental in Kandy, with motion, 3D and brand skills):
  - The agent wrote `DESIGN.md` first.
  - It produced a distinctive dark and electric-lime identity with a condensed display headline.
  - It built working navigation, a menu, scroll reveals and a booking form that validates and says nothing is sent.
  - It added a real three.js hero (wireframe wheel rings and particles that follow the pointer) that pauses off-screen and falls back on weak devices.
  - Every sample was labelled.
  - It used 5% of the trial period's usage in 4 steps.
- **The instructions are longer,** about 1,500 tokens more per run, mostly cached between steps.
- **Next:**
  - a `review_site` tool, so the agent checks links, alt text, metadata and reduced motion mechanically before finishing;
  - uploading and managing custom skills from the app;
  - an image-generation integration (it needs a provider, binary asset storage and pricing, which are the owner's decisions);
  - lifting the starters and templates to the same standard.
- **Plans.** Every plan gets the standard and the built-in skills: the free plan's output is never made worse. Paid plans already add stronger models on Deep, more usage, security checks and publishing. More skills, custom skills or a design-review pass could be paid extras; that's the owner's decision.
