# Stage 202: a Chat that goes past its picture, then Build's own workspace

- **Date:** 2026-11-17
- **Branch:** `feat/stage-202-chat-and-workbench` (cut from `feat/stage-201-farbaek-ai`)
- **Pull request:** #265, against `main`. It carries stages 200 and 201 as well (#263, #264), so merging it lands all three, and stage 201's migration v100 must be applied and read back first.
- **Decisions:** ADR 0218 (Chat's stage, and answers that hand off), ADR 0219 (Build's workspace)
- **Migration:** none

## What the owner asked

1. Whether the real Chat looks like the homepage's picture of it, and then: "Our chat interface must never feel boring or like an ordinary AI chat interface", with the picture as the inspiration taken further: playful and professional, 3D, animation, refined light, on every screen.
2. A dedicated development workspace for Build ("Do not simply present Vibe Coding as another chat interface"), to be done in this session.

## Part 1, done: Chat

- Chat is a rounded window on a stage of light on wide screens; the light travels round the window while Farbaek AI answers.
- The sidebar has the four spaces in colour, "Farbaek AI", a light New chat pill and a white pill for the current chat.
- The welcome screen has the knight in his Loom and coloured starter cards.
- Answers have the knight beside them, with an orbit while one is being written.
- Chips under the latest answer hand the request to Images, Video or Build, for real.
- The message box has light under it while in use.
- The spectrum has night values for Chat's dark theme.
- On a phone held sideways the welcome screen's message box scrolls with the page instead of covering half of it.

Files: `src/components/chat/{chat-shell,sidebar,conversation-view,message,composer}.tsx`, `src/styles/chat-theme.css`, `src/core/chat/{handoff,protocol}.ts`, `src/core/agent/prompt-start.ts`, `src/components/build/prompt-composer.tsx`, `src/components/studio/studio.tsx`, `src/components/marketing/home-demo.tsx`.

## Verified (Chat)

- Looked at in headless Chrome against the demo workspace: the welcome screen and a conversation at 1440 by 900 and 1280 by 720, Chat's night theme, the busy state, a phone (390 by 844) and a tablet (820 by 1180).
- Each chip pressed in the sample chat: the request arrived in the Images box, the Video box and the build box; nothing was in the address, and the studios' key was cleared after use.
- `src/core/chat/handoff.test.ts` (6 tests), the design tests (212 of 212, with the night colours), the chat, build and agent tests (173 of 173), lint and the type check.
- `qa:a11y` on `/app/chat`, `/app/images` and `/` at 1280 and 375: no findings. `qa:responsive` on `/app/chat`, `/app/images` and `/app/video` at nine sizes: no sideways scroll, cut content, small or lost taps.

- The production build (demo) succeeds on this branch. `qa:vitals` on it, phone profile, median of three: `/` LCP 2.04 s, CLS 0, TBT 194 ms (LCP was 1.87 s before the knight grew; he is the largest paint, and his picture is now larger); `/app/chat` LCP 1.70 s, CLS 0, TBT 224 ms, 535 KB of script (no earlier measurement of this route to compare with).

## Not verified (Chat)

- A real answer streaming, so the turning light and the orbit were only seen with the busy state set by hand: the demo workspace can't send.
- The 3D Loom on the welcome screen (headless Chrome draws the 2D one).
- A real phone.
- In the demo only, the read-only notice makes the pinned message box 3 px taller than the audit's limit at 320 px.

## Part 2, done: Build's workspace (ADR 0219)

The owner then asked for the workspace to "align perfectly with our current UI/UX design language and colour scheme", so it was built in Chat's frame from the start.

- **`/app/workbench/[projectId]`**: one full-screen screen per project, a rounded window on the same stage of light as Chat, with Build's leaf colour. **`/app/workbench`** is the picker: the build box and the projects to open.
- **Agent pane:** the open request as a conversation, with the plan in the plan card's words, the real Approve and build control, the live steps, the card to approve or refuse a command, Stop, the result, and the box for the next request or a message to the working agent. A menu switches between the project's requests.
- **Preview pane:** the site, live, with Before and With this change while a change waits; a project that can't be shown says why and offers the real way to open it.
- **Code pane:** the file tree and the Files page's editor. Edit, review the change as a diff, save as a new revision; read-only with the reason where saving is off.
- **Output pane:** the commands the run recorded with what they printed and how they ended, the files it changed, and the latest check. Not a terminal: it links to a test space for that.
- **Layout:** on a wide screen the Agent sits beside the Preview or the Code with Output as a drawer; the borders drag and answer the arrow keys. On a phone or a tablet, one pane at a time from a bar at the bottom. Remembered in the browser.
- **The flow stays inside:** a hidden `surface` word (`page` or `workbench`) on the three build actions; the server builds the address from ids it holds (`src/core/agent/build-surface.ts`).
- **Shared, not copied:** `useRunFeed` (the run's polling, also used by the run page), `loadPlanCard` (the plan card's reading, also used by the plan page), `KnightMark` (also used by Chat's answers), a `readOnly` option on the editor surface, and `runCommands` beside `runFiles`.
- **Small page, lazy panes:** one file and the preview are read by their own JSON routes (signed in, the person's own reader, never cached); the preview only when a key made from the files' revisions and the waiting change has changed.
- **Ways in:** Chat's sidebar, each project's page ("Open it in Build"), and the audits' route list.

New files: `src/app/app/workbench/**`, `src/components/workbench/**`, `src/components/brand/knight-mark.tsx`, `src/components/build/use-run-feed.ts`, `src/server/workbench/**`, `src/server/workspace/plan-card.ts`, `src/core/workbench/**`, `src/core/agent/build-surface.ts`.

## Verified (Build's workspace)

- Looked at in headless Chrome against the demo workspace at 1440 by 900: the picker, the Agent beside the Preview, the Code view with a file open, Output open, and the Agent's border moved with the keyboard; and on a phone (390 by 844): each of the four panes.
- The Preview pane's drawing with a static site, at 1440 by 900, 1280 by 720 and on a phone. The sample workspace has no static site, so the preview route's answer was stood in for in the test browser: this checked the pane, not the route.
- Unit tests: where a build's steps return to (5), the task the workspace opens on and where it stands (13), pane sizes and the remembered layout (7), the preview's change key (5), the commands a run ran (3).
- The design tests pass with the new screens; lint and the type check are clean.
- `qa:responsive` on both routes at nine sizes: no sideways scroll, cut content, small or lost taps, nothing out of proportion. `qa:a11y` on both at 1280 and 375: no findings.

- On the final code: lint clean, the type check clean, the full suite (3,740 tests pass, 17 skipped; the run's one unhandled error is the mesh test's temporary folder clean-up, which was there before and isn't touched here), and the production build (demo) with the four new routes.
- On that production build: `qa:responsive` on the picker, the workspace and Chat at four sizes, clean; `qa:vitals`, phone profile, median of three: the picker LCP 1.57 s, CLS 0, TBT 168 ms; the workspace LCP 1.52 s, CLS 0, TBT 183 ms, 510 KB of script.

## A fresh review, and what it found

A separate agent read the new server and screen code without having written it. It confirmed the reads are safe (every one goes through the person's own client under the database's row rules; the preview's task is tied to its project; the file route is always JSON and never cached; nothing new reaches the browser; the extracted plan card and run feed behave as before; the redirects can't be steered). It also found seven real bugs, all fixed before the first commit:

- **A reviewed change could be saved into the wrong file.** Opening a file from Output skipped the Code pane's guard, and the review wasn't tied to a path. Now the pane owns which file is open, every way of opening one goes through the same guard, and a draft, a review and an error each remember their file.
- **Discard left the edits on screen.** The editor is started again from the saved text.
- **Starting a build dropped unsaved edits.** The run's feed is now a child that draws nothing, so the frame and its panes stay put when a run starts or changes.
- **The kept prompt was never cleared** after a build from the picker. Arriving at a request clears it, as the plan page does.
- **The layout did nothing when the browser refused to store it.** It now holds for the visit.
- **A timed-out command was labelled "Running".** A command is recorded once it has ended, so no exit code now reads "No result recorded".
- **Two requests with the same title** collided in the menu. Menu rows are told apart by position.

From its "plausible" list, also done: a save that lands after leaving a file no longer touches the screen; a failed read has Try again; the site's pictures travel once in the preview's answer instead of once per version; the task machine's own list of ended states is used, so an ended request is never offered for approval and an old dead one is never preferred over newer work; a plan that can't be read no longer takes the page down; and dragging a border no longer redraws the panes on every movement.

## Not verified (Build's workspace)

- A real build, from the request to the applied change: the sample workspace can't start one. So the plan waiting with its Approve and build control, the live steps, the command card, Stop, and coming back to the workspace after approving were not seen running. Their rules are unit-tested and they are the run page's own parts.
- Editing in the Code pane: typing, reviewing, discarding and saving a file, and opening a changed file from Output with unsaved edits. The sample workspace is read-only and has no runs, so the fixes above were made by reading the code, not by pressing the buttons. Saving calls the Files page's own action.
- The preview route with a real static project.
- A real phone.

## Next

- Reviewing and applying a change inside the workspace (it is still on the task page).
- The same frame for the image and video studios, if the owner wants every space to stand on the stage.
