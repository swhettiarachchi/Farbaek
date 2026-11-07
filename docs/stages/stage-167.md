# Stage 167: A skill library, and skills from GitHub

- **Branch:** `feat/skill-library`, from `main` (with the stage 166 record commit).
- **ADR:** 0179. No migration.
- **Skills used:**
  - **Integrated:** the owner's own skills are the content of this stage. The taste skills, frontend-design and ui-ux-pro-max became library editions, and premium-app-ui became Farbaek's own library skill.
  - **For the UI:** `farbaek-ui` and `premium-app-ui` for the pages and states, and `frontend-design` for the cards' hierarchy and the plain copy.
  - **For checking:** `built-in-browser` on the demo workspace.

## What the owner asked

Make the design skills they use available to every Farbaek user, and let people connect whichever skills they need while they build.

## What was decided

See ADR 0179. In short:
- **Library, not paste.** A library of open-licensed skills, each added to a project in one step.
- **Fitted editions.** Each original is long, so it became a Farbaek edition under 4,500 characters that keeps its author's rules and says what changed. Its licence travels with it.
- **Skills from GitHub.** Any skill can come in from a GitHub link and waits for review.
- **One skill left out.** mobile-app-ui-design has no licence, so it isn't in the library. Its general principles are now in Farbaek's own words in the built-in Mobile app screens skill.

| In the library | Author | Licence | What changed |
| --- | --- | --- | --- |
| Design taste (design-taste-frontend) | Leonxlnx | MIT | Settings dials folded into choices from the brief. It no longer asks questions, because a build can't stop to ask. |
| Distinctive visual direction (frontend-design) | Anthropic | Apache 2.0 | What the Farbaek standard already covers was taken out. |
| High-end agency look (soft-skill) | Leonxlnx | MIT | No filter blur, labels at least 12 px, and first-screen text shows at once. |
| Editorial layout and motion (gpt-taste) | Leonxlnx | MIT | Python randomisation became deliberate variation, and filter effects were taken out. |
| UI and UX checks (ui-ux-pro-max) | Next Level Builder | MIT | The rules kept, without the search script and data files. |
| Premium app screens (premium-app-ui) | Farbaek | Farbaek's own | Shortened from the owner's skill. |
| Art direction for site pictures (imagegen-frontend-web) | Leonxlnx | MIT | Concept-image direction applied to real pages, with photo briefs as placeholder alt text. |
| Art direction for app screens (imagegen-frontend-mobile) | Leonxlnx | MIT | Concept-image direction applied to real screens and phone frames. |

Three helpers wrote the first drafts from the originals, each told to keep the author's rules and add none. I read every edition and fixed three places that would have worked against a build:
- a 10 px label;
- a reveal that kept first-screen text hidden;
- two "ask the person" steps, which a build can't do.

## What was built

- **`src/core/agent/skill-library.ts`:**
  - where a library skill's files go;
  - `parseSkillLink`, which turns any accepted GitHub link into raw.githubusercontent.com only;
  - `licenceName`.
- **`src/server/workspace/skill-import.ts`:** reads a skill and its licence from GitHub, with no redirects, a 10-second limit and 64 KB at most.
- **`src/content/skills/library/`:** each skill's SKILL.md and LICENSE.txt, the catalog in `index.ts`, and `texts.generated.ts`, made by `node scripts/skills/build-library.mjs`.
- **Server actions:**
  - `addLibrarySkillAction` adds a skill, approved as added, and never over a person's edited copy;
  - `importSkillAction` brings one in held for review;
  - adding a sixth skill is refused with the reason;
  - removing a skill removes its licence too.
- **Pages:**
  - `/app/skills` (More tools, "Skills") shows the library cards, a note on your own and GitHub skills, and the built-in skills.
  - The project page's Skills section offers Library, GitHub and Write one.
  - The plan card links to Add a skill.
- **Agent:** all skill text in one build may now reach 32,000 characters, up from 24,000.
- **The public site's capability line** now names the library and GitHub skills.

## Checked

- **Tests:**
  - `src/content/skills/library.test.ts`:
    - the generated module matches the folders;
    - every edition parses, fits, credits its author and source, says it was changed, and carries its licence;
    - three editions fit beside the built-in skills;
    - mobile-app-ui-design stays out.
  - `src/core/agent/skill-library.test.ts`: links that must never reach anything but GitHub's raw host, and licence names.
  - `src/server/workspace/skill-import.test.ts`: licence beside or at the top, none, GitHub down, missing, moved, too big (by header and by stream), not a skill.
- **On the demo workspace, at 1280 px and 375 px:**
  - the Skills page, a card's full text, and the project's Skills section with all three ways;
  - nothing scrolls sideways, no text is under 12 px, and the switch's three pills are 44 px high.
  - The demo refuses writes and now says so once, above the choices.
- **Found by looking:**
  - the switch wrapped onto two rows on a phone;
  - the reason a button was grey wasn't shown;
  - the skill text showed raw `##` marks.
  All three are fixed.

## What an independent review found, and the fixes

A fresh reviewer read the actions that write files and the GitHub fetch. Every finding was real:
- **Importing could replace a skill with the same name,** including the library's edition, and pasting the field's own example link would do it. Now a skill the project already has is never replaced: an identical one is reported as already there, and a different one is refused with the reason.
- **A body that trickled past the time limit, or dropped halfway, crashed the action.** Now it says GitHub didn't answer.
- **A skill could hide instructions from its reviewer.** It could use characters that don't show or that reorder text, or text far off to the side on one long line. Now:
  - every project skill reaches the agent without those characters;
  - one from GitHub that has direction or tag characters is refused;
  - the review screen wraps long lines and marks hidden characters.
- **Smaller fixes:**
  - The import's message was lost, because the Skills section changed shape when a skill arrived for review. Now `Disclosure` opens itself instead.
  - GNU licences were over the size cap and reported as missing.
  - GitHub's Raw button links (`refs/heads/main/...`) and `github.com/.../raw/...` links weren't read.
  - An unrecognised licence wasn't flagged, and a licence that failed to save was reported as saved.
  - A licence is now saved before its skill.
  - A same-named skill under `.claude/skills` would have hidden the library's copy. That's refused now, and "Added" counts it.
  - Removing a skill deleted a `.claude/skills` licence.
  - A name with no Latin letters gave an empty folder name.
  - Viewers made the server fetch from GitHub before being refused.
  - A full project blocked updating a skill it already had.
  - A failed link was cleared, and the project choice jumped back after each add.
  - The text box had no role.

**Left as it was:**
- **Import speed:** an import makes up to seven requests to GitHub, so it can take a while. There's no per-person limit on how often anyone imports.
- **Overflow:** when a build's skill text passes 32,000 characters, the project's own skills are the ones left out, and the run's note still lists them. That was true before this stage.

## Not checked yet

- **On production:** adding a library skill to a real project, bringing one in from GitHub (the server's own request to GitHub), and a build that follows a library skill. These need the merge.
- **The iPhone app:** it reaches these pages through its in-app browser. There's no native screen for skills.
