# ADR 0219: Build's workspace

- **Status:** accepted (stage 202, 2026-11-17)
- **Builds on:** ADR 0025 (the live workspace), ADR 0027 (prompt-first builds, talking to a running agent, instant previews), ADR 0002 (the code editor), ADR 0010 (files as revisions), ADR 0169 (previews in their own frame), ADR 0214 (the spaces), ADR 0217 (the spectrum), ADR 0218 (Chat's stage)
- **Changes:** ADR 0025's "not built yet": a live preview beside the steps, and one place for the whole flow

## Context

The owner asked for a "dedicated vibe-coding development workspace" and said: "Do not simply present Vibe Coding as another chat interface", no fake buttons, and anything unavailable clearly told apart from what works. Then, once Chat had been redesigned: make the workspace "align perfectly with our current UI/UX design language and colour scheme".

Everything needed already existed and worked, on five pages: the build box and plan card (`/app/new`), the run with its steps (`/app/build/[runId]`), the files and editor (`/app/projects/[id]/files`), the preview (the project page) and the checks (the task page). Building meant walking between them.

## Decision

**One full-screen screen per project, `/app/workbench/[projectId]`, in Chat's design language.** It stands in the same frame as Chat (ADR 0218): a rounded window on a pale stage with the spectrum's light behind its edges, which travels round while the agent works. Build's colour is leaf. `/app/workbench` is where it starts: the build box and the projects to open.

**Four panes, each drawn once:**

- **Agent.** The open request as a conversation: what the person asked, then the agent's side with the knight beside it. Its plan in the plan card's words, the real Approve and build control, the live steps, the card to approve or refuse a command, the result. Under it, the box for the next request, or for a message and Stop while the agent works. A menu switches between the project's requests.
- **Preview.** The site, live, in the same locked-down frame as everywhere else, with Before and With this change while a change waits. A project that can't be shown here says exactly why and offers the real way to open it.
- **Code.** The file tree and the same editor as the Files page, with its colours. Editing follows the Files page's rule: change, review the exact change as a diff, save as a new revision through the same action. Where saving is off it reads and can't be typed into, and says why.
- **Output.** Every command the run recorded with what it printed and how it ended, the files it changed, and the latest check. It is not a terminal: typing commands needs a test space, which has its own screen, so Output links there instead of drawing a prompt that can't run anything.

On a wide screen the Agent sits beside the Preview or the Code, with Output as a drawer under them; the borders drag, and answer the arrow keys, Home and End. On a phone or a tablet one pane shows at a time, chosen from a bar at the bottom. The layout is remembered in the browser.

**It reuses the build flow, it doesn't copy it.** `ApproveBuild`, `StartRun`, `PromptComposer`, `EventRow`, `ApprovalCard`, `MessageBar`, `StaticPreview` and the CodeMirror surface are the same components. The run's polling moved into `useRunFeed`, shared with the run page. The plan card's reading moved into `loadPlanCard`, shared with the plan page, so the two can never disagree on whether a plan may be approved or what it costs.

**The flow stays inside.** Starting from a prompt, approving a plan and starting a run each end with a redirect. The form says only which surface it is on, one word from a fixed list (`page` or `workbench`); the address is built on the server from ids the server holds (`src/core/agent/build-surface.ts`). No form can send anyone to an address of its choosing.

**The page stays small.** A server action that saves re-renders the page inside its answer, so the page carries only the project, a slim file list, the tasks and the open task's plan, run and check. One file's content and the preview are read by their own routes when a pane asks: signed in, through the person's own reader, JSON only, never cached. The preview is read again only when a short key made from the files' revisions and the waiting change has changed.

**Security is unchanged and unweakened.** No new table, no migration, no service-role read. Every read goes through `loadAppContext()` and the person's own reader or client, so the database's row rules stay the boundary; a project someone can't see is not found. Saving a file is the existing action with its path, size, secret and revision checks on the server.

## Honest gaps

- Reviewing and applying a change is still on the task page (keep or leave out each part, the approval window, undo). The Agent pane links to it and the Preview pane shows the change meanwhile.
- No interactive terminal: see Output above.
- Apps with a server don't preview inside the page; the pane says so and offers Preview, which opens them in a test space.
- The sample workspace has no runs, so there its Output is empty and says why.
- Adding, importing and deleting files, and a file's history, stay on the Files page, linked from the tree.

## Consequences

- No new dependency. The split panes are about a hundred lines of pointer and keyboard handling with tested rules (`src/core/workbench/split.ts`).
- `/app/workbench` joins the own-frame routes, so it provides its own skip link, heading, `main` and ways out, and says the sample and archived bands itself.
- Chat's sidebar and the project page link to it. The run page, the plan page, the Files page and the task page all still work as before.
