# Stage 212, part 1: Home starts with one box, and Chat is a phone tab

- **Date:** 2026-11-22
- **Branch:** `feat/stage-212-home-and-nav`, on top of `feat/stage-211-dark-mode` (PR #276), which is on top of the logo (PR #274)
- **Decision:** ADR 0228
- **Migration:** none. **New dependency:** none.

## What was built

- **The main screen is a greeting and one box**, centred: the logo, "What can I help you with?", the box, the plan in one quiet line, then what needs the person. The old page title and plan paragraph are gone from the top.
- **The box asks or builds** (`src/components/app/start-box.tsx`). Ask takes the words to Chat's box, ready to send; Build is the build box Home always had. The switch remembers the last choice.
- **The phone's tabs are Home, Chat, Build, Approvals and More.** Projects moved under More; project, task and template pages light the Build tab. The Chat icon in the phone header is gone.
- Nothing else moved: the desktop sidebar, every address, and where signing in lands are as they were.

## Verified

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: clean.
- `pnpm test`: 4,306 passed, 17 skipped, on the second of two runs. The first run had one failure that did not repeat and whose name was not captured; the areas this change touches passed both times. It should be watched for on the next run.
- **By using it** in a browser at 390 and 1280 px on the local demo workspace: the switch starts on Ask, Build shows the build box, the choice survives a reload, and a question typed in Ask opens Chat with the words in its box, nothing sent and nothing in the address. The phone bar shows the five tabs.
- The layout audit found nothing on Home or More at 375 and 1280 px, nor on Home in Dark at 390 px. After the main screen was rebuilt it was audited and photographed again at 390 and 1280 px, and in Dark at 1280 px: nothing found.

## A fault found after the merge

For a workspace that hadn't built anything yet, the new main screen showed the greeting with no box under it: the build box sat further down, inside the first step, and there was no way to ask from Home. Found by reading the page's code for that case after #277 was live.

- **The fix** (`fix/home-box-for-new-workspaces`): everyone gets the box under the greeting. Until something is described, Build leads; a person's own choice still wins once they make one. The first step links to the box, as it always did.
- **Checked:** typecheck, lint, build, 482 design, app and workspace tests, and the browser check of the box and tabs again at 390 and 1280 px.
- **Not seen in a browser:** the new-workspace screen itself. The demo workspace already has projects, so the check ran on an existing workspace; the new case rests on the code and the types.

## Not done

- **Part 2:** one frame for every signed-in page (Chat's window and sidebar for Home, Projects, Tasks and the rest), one menu behind a plus button in Chat's composer, and "Build" opening one place.
- Real phones: the checks are emulated screens.
