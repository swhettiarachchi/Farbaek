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

# Stage 212, part 2: one frame for every signed-in page

- **Date:** 2026-11-22
- **Branch:** `feat/stage-212-one-frame`, from `main`
- **Decision:** ADR 0230
- **Migration:** none. **New dependency:** none.

## What was built

- **Every signed-in page sits in Chat's frame on wide screens:** a rounded window on a pale stage with the spectrum's light behind its edges, the sidebar inside it, and the page scrolling inside it (`src/components/app/app-frame.tsx`). Phones and small tablets are as they were.
- **A shorter sidebar that matches Chat's:** Home, Chat, Images, Video, Build, Projects, Approvals, with the four spaces in their colours. Tasks leads More tools. The sidebar is 280 px, as Chat's is.
- **Chat's sidebar starts with Home**, so both lists begin the same way.
- **The sidebar leads with what a person does first:** New build, search, then the workspace, then the list.
- **Back and Forward return to where a page was left.** The browser does that for a page that scrolls itself; a window that scrolls inside itself has to remember, so the frame does.
- **An older fault found on the way, and fixed:** a task page's progress line logged a hydration error for anyone who turns motion off, and drew its lines for them anyway. Its first frame no longer depends on that setting (`src/components/proof/proof-thread.tsx`).

## Verified

- **By using it, in a real browser** (demo workspace, 1440 px): the page itself no longer scrolls; the window sits 16 px in on every side with a 28 px corner; the sidebar is 280 px; a new page starts at its top; a link to a part of a page (`#your-data`) lands in view; no page errors.
- **Phones are as they were** (375 px): the page scrolls as a document, the tab bar is pinned, nothing is framed.
- **Every signed-in route, at 1280 px and on an 1180 px touch tablet:** 68 page views, none scrolling sideways, none cutting content off, no small or lost taps, none out of proportion. Two logged the progress line's error above; after the fix, the task page logs none with motion on or off, at 1280 and 375 px, and every step and line is fully drawn once "Full details" opens.
- **Both looks, looked at** at 1440 px: Home in Crystal White and in Dark, Projects in Dark, Chat in Crystal White.
- **Back and Forward, by using them:** Settings left 700 px down and Projects 250 px down are both found there again; the same pages opened by a link start at the top.
- `pnpm typecheck`: clean. `eslint` on the changed files: clean. `pnpm test`: 4,347 passed, 17 skipped; the one failure was in the price model's draft, which is not in this branch (stage 218). `pnpm build`: passes.

## Not done

- **Chat, the studios and the workspace still draw their own copy of the frame.** They look the same; they should share the one component.
- **"Build" still opens more than one place** (`/app/build`, `/app/new`, the workspace). One start is the next step.
- **Not looked at:** real phones, the staff console and admin in the frame (they keep their own shell), and the signed-in live site.
- The sidebars of Chat and of the rest are close, not identical: row height and text inset differ by a few pixels.
