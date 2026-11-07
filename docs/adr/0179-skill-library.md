# ADR 0179: A skill library, and skills from GitHub

- Status: accepted (2026-11-07).
- Extends ADR 0030 (the Studio standard and skills) and ADR 0043 (skill pinning).

## Context

The owner asked for the design skills they use themselves to be available to everyone who builds on Farbaek, so that people can connect whichever skills they need. They named frontend-design, gpt-taste, design-taste-frontend, imagegen-frontend-web, high-end-visual-design, imagegen-frontend-mobile, premium-app-ui, ui-ux-pro-max and mobile-app-ui-design.

Farbaek already had two kinds of skill. Twelve built-in skills are chosen on each plan. A project can also keep up to five of its own in `.farbaek/skills/<name>/SKILL.md`, and each applies only in the version someone approved. Adding one meant pasting it, and nothing helped anyone find a good one.

Three things shaped the design:
- **Licences.** Giving a skill to every user is distributing it.
  - The five taste skills are MIT (Leonxlnx).
  - UI/UX Pro Max is MIT (Next Level Builder).
  - frontend-design is Apache 2.0 (Anthropic, github.com/anthropics/skills).
  - premium-app-ui is Farbaek's own.
  - **mobile-app-ui-design (github.com/ceorkm/mobile-app-ui-design) has no licence, so nobody may share it.**
- **Size.** A build reads at most 8,000 characters of a skill and 24,000 of skills altogether. The originals run from 8,000 to 88,000 characters, and some rely on scripts and data files Farbaek doesn't run.
- **Authority.** The agent treats a file it reads as project data, never as instructions. That's what keeps a hostile file from steering it. So a skill can only guide a build through its approved SKILL.md, not through extra files the agent might read.

## Decision

**A library of open-licensed skills, each added to a project in one step.**
- **Farbaek editions.** Each skill in the library keeps its author's own rules, shortened to under 4,000 characters, and drops what can't work in a build (install steps, search scripts, image-model prompts). The first line says whose it is, under what licence, where the original is, that it was shortened and how. That also meets Apache 2.0's rule that changed files say so.
- **Licences travel.** Adding one writes its SKILL.md and its `LICENSE.txt` side by side as ordinary project files, with the same limits, history and screening as any file. Removing it removes both.
- **Approved as added.** The person chose it after being able to read it in full, as with a skill they paste.
- **A project's own edited copy is never overwritten.** Adding the library's version over it is refused with the reason.
- **The two image skills are adapted, and they say so.** They were written to make concept images of whole designs, and Farbaek builds real pages and screens. So their art direction applies to the build, and their photo briefs become the alt text of placeholders.
- **mobile-app-ui-design isn't in the library.** Its general principles are common design knowledge: the 8 px grid, few type sizes, colour in proportion, the thumb zone, designed states and the peak of a flow. They're written in Farbaek's own words in the built-in Mobile app screens skill.

**Any skill from a GitHub link.**
- **Links it accepts:** a SKILL.md, the folder it's in, or a repository.
- **Only GitHub's raw file host.** The file is read only from raw.githubusercontent.com, with no redirects, a 10-second limit and 64 KB at most. A pasted link can't make the server reach anything else.
- **Its licence comes too.** It's looked for beside the skill, then at the top of the repository, and saved with it if found. If none is found, the person is told to check they may use it.
- **It waits for review.** A skill from outside is like a skill in an import (ADR 0043): no build uses it until someone reads and approves that exact version.

**Where people find skills.**
- **A Skills page** (More tools): the library as cards, each with what it does, where it fits, its author and licence, its full text, and "Add to" a project. The built-in skills are listed there too, with a note on adding your own.
- **The project page's Skills section** has three ways in: from the library (the default, one step), from a GitHub link, or writing one.
- **The plan card** links to Add a skill.

**Limits.**
- A build used five of a project's skills and quietly ignored the rest. Now adding a sixth is refused, with the reason.
- All skill text in one build may reach 32,000 characters, up from 24,000. That fits the built-in skills a plan ticks and three library editions. A test keeps it true.

## Consequences

- Anyone on any plan can give a project a proven design skill in one step, and see who made it and on what terms.
- A library update doesn't change projects that already have the skill: each keeps the version someone approved.
- The texts live in `src/content/skills/library/<id>/` and reach the app through `texts.generated.ts`, made by `node scripts/skills/build-library.mjs`. A test fails while the two differ.
- Only skills whose licence lets anyone share them may join the library. A test keeps mobile-app-ui-design out.
- The iPhone app reaches skills through the web pages in its in-app browser. There's no native screen for them yet.
