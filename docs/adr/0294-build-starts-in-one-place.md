# ADR 0294: Build starts in one place

- **Status:** accepted (stage 286, the Farbaek program, 2026-11-26)
- **Builds on:** ADR 0027 (one sentence becomes a project, a task and a drafted plan), ADR 0219 (Build's workspace, and the one word that keeps a build's steps inside it), ADR 0228 (a signed-in page opens on one question and one box), ADR 0230 (every signed-in page in one frame), ADR 0171 (a share from another app arrives as a draft).
- **Changes:** where "Build" leads, from every menu and button. No migration, no new dependency, no paid service.
- **Part of:** the briefs' one navigation: "Build" opening one place (item 8 in the order of work). One sidebar across the spaces is the other half and is not in this decision.

## Context

"Build" started in three places, and each showed a different page:

| Reached from | Address | It showed |
| --- | --- | --- |
| The app's sidebar and the phone's Build tab | `/app/build` | A box, the agent's state, tasks ready to build, every run |
| The New build button, Chat's hand-over, the templates, the public site's links for someone signed in, a share from another app | `/app/new` | A box, the templates, other ways to start |
| Chat's sidebar and the workspace's own header | `/app/workbench` | A box, the projects to open in the workspace |

A person who pressed "Build" in Chat and "Build" in the sidebar met two different pages with the same name, and neither had everything: the projects were on one, the runs on another, the templates on the third. The three boxes also went two different ways after "Plan it": two to a plan's own page, one into the workspace.

## Decision

**Every way into Build opens one page: `/app/build`.**

- **In the app's frame.** The sidebar stays beside it and the phone's tabs under it, with Build lit. The workspace's own starting page had neither, so on a phone the only way out was the logo.
- **It opens as Home and Chat do:** one question ("What shall we build?") and one box. A workspace with no projects gets the tall box with examples to press; once there are projects, the shorter one, so the person's work sits higher.
- **Under the box, in this order,** each only when there is something to show:
  1. the agent, drawn only while a run is going or waiting for the person;
  2. tasks whose plan is approved, ready to build;
  3. every open project, each opening in Build's workspace: six, then the rest folded;
  4. the templates;
  5. the five latest runs, with earlier ones folded (the latest thirty are read, so the fold names no number);
  6. how a build works, open for a workspace that has never run one.
- **A server that can't run checks says so under the box,** before anything is started: the person who plans here approves in the workspace, which doesn't say it.
- **The box leads into Build's workspace** for the project, with the plan waiting in the Agent pane: the flow the workspace's own start already had. The workspace reads as a conversation on a phone and shows the preview beside the plan on a wide screen.
- **The two other addresses send people on.**
  - `/app/new` redirects to `/app/build`, keeping a chosen template, a prompt kept through sign-in and a share's title, text and url. Only those five names are carried, each once and within a size, and the path is fixed in code (`buildStartPath`): an old link can only ever lead to Build's start.
  - `/app/workbench` (the address without a project) redirects to `/app/build`.
  - **The proxy answers both, before a page is drawn** (`olderBuildStart`). Every page under `/app` sits inside a loading boundary, so a redirect from inside a page is not a redirect on the wire: the app is painted once with a skeleton and then loaded again. A share or an old link is now one load. The two pages still redirect by themselves, should a request ever reach them.
  - So older links, bookmarks, an installed app's share target and its shortcut all still arrive.
- **Every link inside the signed-in app names the one page:** the New build button, Chat's sidebar, the workspace's header, the command palette, Chat's hand-over to Build, the templates, the empty states, and the installed app's shortcut.
- **A share from another app is still sent to the older address,** in the web manifest and in the Android app alike: the released Android app carries that address, and a test holds the two together. It is sent on with what was shared.
- **Unchanged:** a plan's own page (`/app/new/<task>`), a run's page (`/app/build/<run>`), the workspace for a project (`/app/workbench/<project>`), and where the boxes on Home and on a project's page lead.

## Consequences

- One name, one page. Projects, templates and runs are together, and nothing was on only one of the three before that is not here.
- **A request written on Build's page now opens the workspace,** where two of the three boxes used to open a plan's own page. So the workspace is now where most plans are approved, and an approval covers the whole plan.
  - Its plan block showed less than the plan's own page: not the commands that must pass, and not what the draft assumed. It shows both now (`src/server/workbench/plan-words.ts`), and a test names every part of a plan and where it is said, so a new part can't be approved unseen.
  - It has the cancel control the plan's own page has.
  - Approval and the run feed are the same parts in both places, as before.
- **The agent's picture is no longer on the page while nothing is running.** It moves only for live state (ADR 0172).
- The public site's two links that name the older address are left as they are: the homepage is frozen until the platform is finished, and the redirect carries them.
- The command palette's "Plan a build" used on Build's own page gets a fresh box, so the sentence it kept is the one sent, not what was lying in the box.
- The audits follow: `scripts/qa/routes.mjs` no longer visits the two addresses that redirect and finds the workspace from Build's start, and `qa:vitals` measures `/app/build`.
- **Not yet:**
  - Home's box and a project page's box still open a plan's own page;
  - one sidebar across Chat, the studios, the workspace and the app's pages;
  - the level (ADR 0293) choosing how much of this page shows.

## Verified

See `docs/stages/stage-286.md`.
