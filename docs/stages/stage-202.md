# Stage 202: a Chat that goes past its picture, then Build's own workspace

- **Date:** 2026-11-17
- **Branch:** `feat/stage-202-chat-and-workbench` (cut from `feat/stage-201-farbaek-ai`, pull request #264, not yet merged)
- **Decisions:** ADR 0218 (Chat's stage, and answers that hand off)
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

## Not verified (Chat)

- A real answer streaming, so the turning light and the orbit were only seen with the busy state set by hand: the demo workspace can't send.
- The 3D Loom on the welcome screen (headless Chrome draws the 2D one).
- A real phone.
- In the demo only, the read-only notice makes the pinned message box 3 px taller than the audit's limit at 320 px.

## Part 2, next: Build's workspace

Planned and checked against the code, not started. One full-screen screen per project at `/app/workbench/[projectId]`: the agent's thread (request, plan, approve, live steps, message, approve a command, stop, result), the preview, the code (tree and editor) and the output (commands and checks), resizable on desktop and one pane at a time on phones. No new dependency and no migration. The work reuses `RunLive`'s parts, `ApproveBuild`, `ProposalReview`, `StaticPreview` and `CodeMirrorSurface` rather than rewriting them.

### The plan for it

- **No return address.** A hidden `surface` value (`page` or `workbench`) on `startFromPromptAction`, `approveAndBuildAction` and `startBuildRunAction`; the server builds the path from ids it holds.
- **Small page data, heavy data on demand.** A server action that revalidates re-renders the page inside its response, so the page carries only the project, a slim file list, 30 tasks and the current task's plan card, run, 400 events, usage, change summary and checks. JSON routes (signed in, the person's own client, `no-store`) give one file, the preview and the change.
- **Split `RunLive`, don't embed it:** `src/components/build/use-run-feed.ts` (the polling) and `src/components/build/run-parts.tsx` (`EventRow`, `ApprovalCard`, `MessageBar`, a stop button, the usage line). The run page keeps working as it is.
- **The real plan card and the real review:** `loadPlanCard()` and `src/components/build/plan-sections.tsx` out of the plan page; `loadChangeReview()` in `src/server/workspace/change-review.ts` out of the task page, feeding `ProposalReview` unchanged.
- **Panes:** `StaticPreview` and `CodeMirrorSurface` get a `fill` option, `FileEditor` gets `onSaved`, `onCancel` and `onDirtyChange`, and a small client file tree is built on `buildTree`.
- **Honest gaps:** apps that aren't static show the real reason and the existing Preview button; the interactive console isn't embedded, so Output links to a test space or says why there isn't one; a tab appears only once it works.
- **Order:** core rules with tests, the `RunLive` split, `surface`, the plan card, the pane options, the server loader and routes, the shell, then Preview, Code, Changes and Output, then the entry links, the audits' route list and a decision record.
- **Pitfalls found:** drag handles over the preview frame need pointer capture; hidden phone panes measure zero wide, so the preview mounts when first shown; stored pane sizes are read with `useSyncExternalStore`; unsaved edits are guarded when switching files; own-frame pages lose the layout's demo, saving-off and paused bands, so the workspace shows them itself; client files may only import types from `@/server/**`.
