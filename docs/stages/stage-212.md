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

# Stage 212, part 3: one definition of the frame, and the studios inside it

- **Date:** 2026-11-23
- **Branch:** `feat/stage-212-studios-in-frame`, on top of part 2 (`feat/stage-212-one-frame`, #280)
- **Decision:** ADR 0230, "One definition"
- **Migration:** none. **New dependency:** none.

## What was built

- **The image and video studios sit in the same window as everything else.** They were the last signed-in pages drawn flat, edge to edge, so Home to Images changed the whole screen. The light behind the window travels while a picture or a film is being made.
- **The stage, the window and the light are defined once** (`src/components/ui/stage-window.tsx`) and used by the app's frame, Chat, the studios and Build's workspace. Part 2 left four copies.

## Verified

- **Measured in a browser, at 1440 px:** Home, Projects, Chat, Images, Video and Build's workspace each show the window 16 px in on every side, with a 28 px corner, a hairline, the soft shadow, the same stage colour and the light behind it; the screen itself doesn't scroll on any of them. No console errors.
- **At 375 px:** none of the six has a stage, a corner or a hairline; each is edge to edge, as before.
- **Looked at:** Images in Crystal White and Video in Dark at 1440 px, and Images on a phone.
- `pnpm typecheck` and lint on the changed files: clean. `pnpm test`: 4,331 pass, 17 skipped. `pnpm build`: passes.

## Not done

- **One sidebar.** Chat keeps its conversations, the studios their library, and Build's workspace has none.
- **"Build" starts in three places** (`/app/new`, `/app/build`, `/app/workbench`), two of them with the same box, leading into two flows. Choosing the one that is Build is the next step here, and it needs the build flow walked in a browser, not a link changed.
- **One plus menu in Chat's box.**

# Stage 212, part 4: full screen

- **Date:** 2026-11-23
- **Branch:** `feat/stage-212-full-screen`, from `main`
- **Decision:** ADR 0230, "Full screen"
- **Migration:** none. **New dependency:** none.

## What the owner asked

"Remove the colored line surrounding the platform. make it full screen size", with a screenshot of Home in the window.

## What was built

- The stage, the gap and the coloured light round the window are gone from the app's frame, Chat, the studios and Build's workspace. Every one fills the screen.
- `src/components/ui/stage-window.tsx` and the light's styles are deleted; the app no longer loads Chat's stylesheet.

## Verified

- **Measured in a browser** at 1440 px in Light and Dark, on Home, Projects, Settings, Chat, Images, Video and Build's workspace: no gap at any edge, no rounded frame, no light; the screen itself doesn't scroll and the page scrolls beside the sidebar. At 375 px, as before. No console errors.
- **Looked at:** Home in Light and Chat in Dark at 1440 px.
- `pnpm test`: 4,361 pass, 17 skipped. Typecheck, lint on the changed files and `pnpm build` pass.
