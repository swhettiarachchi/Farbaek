# ADR 0295: One list of places, in every frame

- **Status:** accepted (stage 287, the Farbaek program, 2026-11-27)
- **Builds on:** ADR 0230 (every signed-in page in one frame; Chat, the studios and Build's workspace bring their own), ADR 0228 (the phone's five tabs), ADR 0286 (an icon in the navigation is the colour of its row's words), ADR 0294 (Build starts in one place).
- **Changes:** what each frame lists as the places of Farbaek, and where. No migration, no new dependency, no paid service.
- **Part of:** the briefs' one navigation (item 8 in the order of work). It is the list made one, not yet one sidebar component: see "Not yet".

## Context

Five pieces of navigation each kept a list of the places, written out separately, and they had drifted apart:

| Where | What it listed |
| --- | --- |
| The app's sidebar | Home, Chat, Images, Video, Build, Projects, Scheduled, Approvals |
| The phone's tabs | Home, Chat, Build, Approvals, More |
| Chat's sidebar | Home, Chat, Images, Video, Build, Scheduled |
| The studios' header | Chat, Images, Video, and a Home icon. No Build |
| The workspace's header | Chat, Images, Video, Build, and a Home icon, on wide screens only |

So Build could not be reached from the studios, and changes waiting for a yes could not be seen from Chat, the studios or the workspace. The four frames were looked at side by side first, on a wide screen and a phone.

## Decision

**The places are one list, written once (`PLACES`), and one component draws it in every frame (`PlacesNav`):** Home, Chat, Images, Video, Build, Projects, Scheduled, Approvals. Same names, order, icons and count of waiting approvals everywhere.

- **Three forms, by what a frame has room for.**
  - **Rows,** in the app's sidebar: all eight, then More tools and the account as before.
  - **Five rows and a strip of icons,** where a sidebar or a drawer has a long list of its own under the places (Chat's conversations, a studio's library on a phone): Home and the four spaces as rows, then Projects, Scheduled, Approvals and More as one strip of icons.
  - **A rail of icons** at the far left, on a wide screen, where the page needs its width: the studios and Build's workspace. Their own header switchers are gone.
- **Why Chat doesn't get nine rows.** It was built and looked at: on a screen 800 px tall, one conversation was left in view, and the conversations are what that sidebar is for. With five rows and the strip, the list takes the room it took before.
- **"More"** ends the list in every frame that doesn't list the tools and the account itself, and leads to the page that has them all.
- **Which place is lit** is one rule (`placeLit`): Build's workspace and a plan's own page are Build. A frame may say otherwise where it knows better (Chat's pictures page has its own row, so it isn't "Chat").
- **The count of approvals** is read once by the signed-in layout and reaches every frame from there (`NavCountsProvider`). So does whether Farbaek replied to a request for help: where Help is behind More, More carries the same unread mark the phone's tabs use.
- **Sized for touch.** An icon is a 40 px circle with a 48 px touch area, 8 px from the next, so two touch areas meet and never overlap. A row is 40 px with a mouse, 44 px on a touch screen and 48 px on a touch phone. The way home at the top of a rail is a full 44 px target.
- **Phones.** The app's pages keep the five tabs. Chat's drawer and the studios' drawer hold the list. The workspace keeps its way home and its Projects link in the header: its bottom bar is for its panes. On a wide screen that header link is gone, since the rail beside it has Build and Projects.
- **Kept one by a test** (`tests/design/one-navigation.test.ts`): no other file may write the list out, and each frame must draw the shared component.

## Consequences

- Build is one press from the studios, and Projects and Approvals, with their count, from Chat, the studios and the workspace.
- **On a phone, a studio's header no longer switches between Chat, Images and Video in one press.** It is the menu, then the place: two presses, as in Chat.
- **In Chat's sidebar, Scheduled is an icon in the strip,** where it was a row.
- **A rail and a strip are icons without words.** Each is named on hover and to a screen reader, and the first five are taught as rows wherever there are rows.
- The workspace is 64 px narrower on a wide screen, and a studio's library column sits 64 px further in.
- A new place is one line in one file, and every frame has it.
- **Not yet:**
  - one sidebar component for the app's frame and Chat's, with the frame's own list as a part of it;
  - the list in Build's workspace on a phone;
  - the places following the level (ADR 0293): all eight are for everyone;
  - the public site's own header.

## Verified

See `docs/stages/stage-287.md`.
