# Stage 286: Build starts in one place

- **Date:** 2026-11-26 and 27
- **Branch:** `feat/stage-286-build-one-place`, from stage 285's branch (merged as #342 before this one was finished)
- **Decision:** ADR 0294 (Build starts in one place)
- **Part of:** the briefs' one navigation, "Build" opening one place; item 8 in the order of work. One sidebar across the spaces is the other half and is not in this stage.
- **Migration:** none. **New dependency:** none. **New paid service:** none.
- **Skills used:** `farbaek-ui`, `farbaek-human-made` and `premium-app-ui` (the page opens on one question and one box, sections only when they have something, motion only for live state, the phone's tabs kept); `ui-ux-pro-max` (one name for one place, predictable back, deep links kept); `ecc-security-review` (the redirect's address fixed in code, only known names carried); `anthropic-skills:chrome-browser` for the pull request and the live check of stage 285.

## Why

"Build" started in three places, each a different page under the same name:

| Reached from | Address | It showed |
| --- | --- | --- |
| The app's sidebar and the phone's Build tab | `/app/build` | A box, the agent's state, tasks ready to build, every run |
| The New build button, Chat's hand-over, the templates, a share from another app | `/app/new` | A box, the templates, other ways to start |
| Chat's sidebar and the workspace's own header | `/app/workbench` | A box, the projects to open in the workspace |

The pages were looked at side by side first, on a wide screen and a phone, with the workspace a request ends in.

## What was built

- **One page, `/app/build`, in the app's frame,** with the sidebar beside it and the phone's tabs under it. It opens as Home and Chat do: "What shall we build?" and one box. A workspace with no projects gets the tall box with examples; once there are projects, the shorter one.
- **Under the box,** each only when there is something to show: the agent (only while a run is going or waiting), tasks ready to build, every open project (six, then the rest folded; each opens in Build's workspace), the templates (a rail on a phone), the five latest runs with earlier ones folded, and how a build works.
- **Its box leads into Build's workspace,** with the plan waiting in the Agent pane.
- **The two other addresses redirect to it.** The proxy answers `/app/new` and `/app/workbench` with a 307 before a page is drawn (`olderBuildStart`), keeping a chosen template, a prompt kept through sign-in and a share's title, text and url, and nothing else (`buildStartPath`). The two pages still redirect by themselves.
- **The workspace's plan block shows the whole plan** (`src/server/workbench/plan-words.ts`): the commands that must pass and what the draft assumed were missing, and an approval covers both. The cancel control is beside the approval there now.
- **Every link names the one page:** the New build button, Chat's sidebar, the workspace's header, the command palette, Chat's hand-over, the templates, the empty states, the installed app's shortcut, the sign-in address a kept prompt returns to.
- **The audits follow:** `scripts/qa/routes.mjs` and `qa:vitals`.

## What a person no longer has to do

- Learn which of three "Build" pages has their projects, which their runs and which the templates.
- Leave the phone's tabs to start a build from Chat's Build link.

## Verified

- **Tests,** new unless said:
  - `core/agent/build-surface.test.ts` (7 new): the one start's address; what an older address may carry (a template, a kept prompt, a share) and that only those names are kept, each once and cut to a size; a value can never become part of the path; the two older addresses and what they lead to; every page they must leave alone (a plan's own page, a project's workspace, a run); an id that isn't one now opens Build's start (changed).
  - `server/workbench/plan-words.test.ts` (4): every part of a plan a person approves is said; a list of every part of a plan with where it is said, so a new part fails the test until it is placed; a plan that allows no changes says so; the card's own list is never changed from here.
  - `core/agent/prompt-start.test.ts` (changed): a share is recognised on Build's start and on the older address, and not on a run's page.
  - `core/chat/handoff.test.ts` and `core/chat/intent.test.ts` (changed): Chat hands a build to Build's start.
  - The whole suite, run after the last change: 5,562 passed, 21 skipped (as before), none failed.
- `tsc --noEmit` with a 4 GB heap, and `pnpm lint`: clean.
- **`pnpm build`:** passed after the last change, with the 4 GB heap.
- **On the running demo, by requests sent by hand:** `/app/new`, with a template, with `resume=1`, with a share's three values, with a made-up `next=`, and `/app/workbench` with and without a query each answered with one 307 to Build's start; the made-up name was dropped; `/app/build` and a project's workspace answered 200.
- **Looked at in the demo workspace** (a development server, sample data), at 1280 and 390 px, light and dark:
  - Build's start: the question, the box, the other ways, Ready to build, Open a project, Start from a template; no sideways scroll; Build lit in the sidebar and in the phone's tabs.
  - `/app/build?template=portfolio`: the template's card above the box.
  - A share (`title` and `text`): "This comes from what you shared" and the text in the box, not sent.
  - Where the New build button, the sidebar's Build, Chat's sidebar and the workspace's header lead: all `/app/build`.
  - The workspace's plan block on a sample plan: its command (`pnpm test`) and "Assumes: …" were shown.
- **A fresh review** of the change by a separate agent, after every check had passed. Seven real things, all fixed:
  1. the two page redirects were a full page load and then a second one (every page under `/app` sits inside a loading boundary): the proxy answers them now;
  2. the audits still visited the two redirecting addresses and looked for the workspace from one of them;
  3. the workspace's plan block showed less than is approved (no required commands, no assumptions) and had no cancel;
  4. the palette's "Plan a build" on Build's own page sent what was lying in the box, or nothing: the box is made afresh;
  5. "N earlier runs" counted only the thirty that are read: the fold names no number;
  6. the notice that a server can't run checks never showed before a first run: it is under the box;
  7. claims the code did not match (Home's door and the studios' header as ways in; "nothing is missing" while only six projects were listed) and an option nothing used.
- **A fault the suite caught:** the web manifest's share address had moved to the new page, away from the one the released Android app carries; a test holds the two together. It stays the older address and is sent on.
- **Not verified:**
  - **A real build started from this page.** The demo can't start one. The path is the one the workspace's own start used: the same action, the same word (`surface=workbench`).
  - **The cancel control in the workspace.** No sample request has a plan waiting for approval, so it was not seen on a screen. It is the control the plan's own page uses.
  - **The palette's "Plan a build" on Build's page,** by hand: the fix is one `key`, read and not pressed.
  - **200% text and a real phone.**
  - The second look after the review's fixes was by reading the page's text in the browser, not by new screenshots.

## Next

- After the merge: check the build on production, open Build from the sidebar, Chat and the New build button, and follow an old `/app/new?template=` link.
- One sidebar across Chat, the studios, the workspace and the app's pages.
- Home's box and a project page's box leading into the workspace too.
