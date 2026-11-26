# ADR 0293: Three levels of how much Farbaek shows: Standard, Advanced, Professional

- **Status:** accepted (stage 285, the Farbaek program, 2026-11-26)
- **Builds on:** ADR 0170 (plain names, and one folded group of tools), ADR 0227 (a person's choice kept as a cookie the server reads), ADR 0220 (Auto picks the model for each question), ADR 0228 (the phone's five tabs and its More page).
- **Changes:** which tools the menus list, and whether Chat lists its models. No migration, no new dependency, no paid service.
- **Part of:** the briefs' "three experience levels: Standard, Advanced, and Professional modes with different levels of interface complexity" (A18, B4).

## Context

The owner's rule is the most intelligence behind the scenes and the least complexity in front of the person. The sidebar's "More tools" group had grown to thirteen rows, from a person's task list to who can change which project, and Chat's menu listed every model to everyone. A person who came to ask a question or have a site built saw the same menus as a developer running a team.

None of the six products studied for the program has named modes: each has one interface that reveals more as it is needed (`FARBAEK_REFERENCE_RESEARCH.md`). The three levels are the owner's own idea. This decision keeps both: one interface, and a choice of where its revealing starts.

## Decision

**A person chooses how much Farbaek shows: Standard, Advanced or Professional. Standard is what everyone gets until they choose.**

- **A level chooses what the menus list. It never decides what a person may do.** What is allowed is the server's, by role and plan, exactly as before. No page, action or API reads the level to permit or refuse anything.
- **Nothing is out of reach at any level.**
  - Search (the command palette) finds every page at every level.
  - A page opens by its address at every level.
  - The tool a person is on is always in its menu, so nobody stands on a page their own menu doesn't show.
  - Where a level leaves tools out, the menu's last row says so ("Show more tools") and leads to the choice. A screen reader hears how many, and at which level.
- **What each level lists under "More tools":**

  | Level | Lists | In all |
  | --- | --- | --- |
  | Standard | All work (with the one pause), Tasks, Survey Studio, Desktop app, Connections | 5 |
  | Advanced | adds Test space, Skills, Move projects, Workflows, History | 10 |
  | Professional | adds Rules, Problems and pause, Who can do what | 13 |

  The spaces (Home, Chat, Images, Video, Build, Projects, Scheduled, Approvals) and the account pages are the same at every level. Survey Studio stays at Standard: it is a space of its own, and the people it is for are not developers.
- **Chat.** At Standard, Farbaek AI picks the model for each question: the menu says so, keeps the answer style and the web switch, and offers "Choose a model yourself", which opens the settings where the level is. From Advanced, the list of models is there as before. At Standard every message asks for Auto, so a model picked earlier at another level is kept in the browser and not used while its list is hidden.
- **Where it is chosen.** In Settings ("How much Farbaek shows") and in Chat's settings. Each choice says what it shows before it is pressed, and the words beside it say it decides two things: how many tools the menus list, and whether the person picks the model in Chat. Pressing one turns the menus at once, with no reload.
- **How it is kept.** A cookie (`fb_level`), for a year, like the look's: the server reads it, so the first paint already has the right menus. Anything but one of the three names is read as Standard. It is per browser, as the look is.
- **A year on Safari too.** The browser's script writes the cookie when a choice is pressed, so the menus turn at once. Safari, and every browser on an iPhone, keeps a cookie written by script for seven days at most. So when a page of the signed-in app is loaded afresh carrying the level's cookie or the look's, the server sends it back unchanged with a year's life (`src/server/http/keep-choices.ts`, from the proxy). Only one of the known choices is ever sent back, and only on a fresh page load: a page that is open could change the choice while its own request was on its way, and an older answer would put it back.
- **One rule in tested code.** `src/core/experience/level.ts` holds the levels, their order and what a level lists (`atLevel`). A menu gives each row the level it first appears at (`from`); a row without one is for everyone.

## Consequences

- A new person's sidebar is five tools long where it was thirteen, and Chat has one fewer choice to make.
- **People already using Farbaek start at Standard too.** Someone who used Rules or History from the sidebar finds them one row lower ("Show more tools"), or by search. This was preferred to a different default for old and new accounts, which would need a record of who is which.
- **A model chosen by hand stops being used at Standard.** The menu says who answers and how to get the list back.
- The level is a convenience, so it is right that it can't be enforced: anyone can set the cookie. Nothing may ever be gated on it.
- **The look's cookie gets its year on Safari as well,** on the signed-in app's pages. It had the same seven-day life there since stage 211. A visitor who chose Dark on the public site and never signs in still has seven days on Safari.
- **A new tool** in the navigation needs a decision about its level, and `app-nav.test.ts` names every tool at each level, so adding one fails a test until that is decided.
- **Not yet:**
  - Settings itself is one length at every level (its developer sections could fold at Standard);
  - Build's workspace shows the code and the output at every level;
  - the Images and Video studios, the desktop app and the phone apps don't read the level;
  - the choice is per browser, not per account: signing in on another device starts at Standard.

## Verified

See `docs/stages/stage-285.md`.
