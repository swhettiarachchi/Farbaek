# ADR 0230: One frame for every signed-in page

- **Status:** accepted (stage 212, part 2, 2026-11-22)
- **Builds on:** ADR 0211 (phone first), ADR 0213 and 0218 (Chat and its stage), ADR 0217 (the spectrum), ADR 0227 (two looks), ADR 0228 (the main screen)
- **Changes:** the signed-in app's frame on wide screens, and the sidebar's first list

## Context

The audit counted five navigation systems. Two of them met a signed-in person every day: Chat's frame (a rounded window on a pale stage, with the spectrum's light behind its edges) and the app's frame (a flat page with a sidebar pinned beside it). Going from Home to Chat changed the whole screen, as if it were another product.

The study of six products found one frame in each of them: the same window and the same short sidebar whatever is open. The owner's brief asks for the entire platform to share one design.

## Decision

**Every signed-in page sits in Chat's frame on wide screens** (1024 px and up).

- A rounded window (28 px corners, a hairline and a soft shadow) on a pale stage, with the same light glowing from behind its edges as Chat's. The light is still.
- The sidebar is inside the window, the same width as Chat's (280 px).
- The page scrolls inside the window; the screen itself doesn't. A new page starts at its top, and a link to a part of a page goes to that part.

**Phones and small tablets are as they were.** The page fills the screen and the page itself scrolls, which is what a phone's browser bars and the keyboard expect.

**The sidebar's first list is shorter, and matches Chat's.**

- Home, Chat, Images, Video, Build, Projects, Approvals. Tasks moved to the top of More tools: a task is one press from its project and from Home, and phones already kept it under More.
- The four spaces carry their colours, as they do in Chat's sidebar: Chat blue, Images rose, Video aqua, Build leaf.
- Chat's sidebar now starts with Home, so both lists begin the same way.

## Why the page scrolls inside the window

A window that stays put while its content moves is what makes it read as a window, and it is what Chat already does. The cost is known:

- The browser doesn't restore the scroll position of an inner area when someone goes Back. So the frame remembers where each page was left, for the visit, and returns there on Back and Forward; a page opened by a link starts at its top. A page whose content arrives late can land short of the place.
- Keyboard scrolling follows focus, as in any app with panes.

Almost nothing in the app depended on the screen scrolling: one page outside this frame calls it.

## What this does not do yet

- **Chat, the studios and Build's workspace still draw their own copy of the frame.** They look the same now; they are not yet the same component, so a small jump is still possible between them and the app's pages (the sidebar's top differs: Chat has New chat and Search chats, the app has search, the workspace and New build).
- **"Build" still opens two places:** the app's sidebar goes to the list of builds, Chat's goes to Build's workspace.
- **One plus menu in Chat's composer.**
- The staff console and admin keep their own frames.

## Consequences

- The frame's light is Chat's stylesheet, so it loads with every signed-in page.
- `pnpm qa:responsive` and its `--theme=dark` run are how a change to the frame is checked on every route.
