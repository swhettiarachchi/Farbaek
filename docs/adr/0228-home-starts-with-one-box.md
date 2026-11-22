# ADR 0228: Home starts with one box, and Chat is a phone tab

- **Status:** accepted (stage 212, part 1, 2026-11-22)
- **Builds on:** ADR 0170 (plain words), ADR 0211 (phone first), ADR 0213 (Chat), ADR 0216 (the studios), ADR 0218 (Chat's hand-offs), ADR 0219 (Build's workspace), ADR 0227 (two looks)
- **Changes:** the phone's five tabs, and what Home's first control is

## Context

The study of six products in a browser (`docs/farbaek/FARBAEK_REFERENCE_RESEARCH.md`) found that all of them open the same way: a greeting and a box to type in, beside a short sidebar. The audit found Farbaek opens differently:

- Home's first control was a box that only builds. To ask a question, a person had to find Chat.
- On a phone Chat was not one of the five tabs. It was an icon in the header and a row under More.
- The app has five navigation systems, and "Build" opens three places.

The owner's brief asks for "ChatGPT-inspired simplicity" across the whole product, and their direction of 2026-11-17 was a chat-first home.

Doing all of that at once would mean moving every signed-in page into one new frame. That is the right end, and too large a step to verify in one go. This ADR is the first step: the two changes a person meets first, with nothing else moved.

## Decision

**The main screen is a greeting and one box.** Home's page title and its paragraph about the plan are gone from the top. In their place, in the middle of the page: the logo, "What can I help you with?" (the same words Chat greets with), and the box. The plan is one quiet line under the box, with the same facts as before: the plan's name, when a trial ends, and that nothing is charged. What needs the person ("Your turn") comes straight after, then the spaces and their work.

**The box asks or builds** (`StartBox`).

- A two-way switch above the box: **Ask** and **Build**.
- **Ask** takes the words to Chat, where they wait in Chat's box, ready to send. Nothing is sent by itself. The words travel in the browser's storage, never in the address, by the same path a question typed on the public homepage already takes.
- **Build** is the build box Home always had, unchanged.
- Ask leads. The switch remembers the person's last choice in that browser.
- A new workspace still meets the build box inside its first steps, as before.

**The phone's five tabs are Home, Chat, Build, Approvals and More.**

- Chat takes the tab Projects had. Five is the most a phone bar holds.
- Projects, Tasks, Images and Video are rows under More, and a project is one press from Home ("All projects") and from Build.
- A project's own pages, a task, a template and checking an app light the Build tab.
- The Chat icon in the phone header is gone: the tab replaces it.

**What does not change:** the desktop sidebar, every page's address, and where signing in lands.

## Why not more, yet

- **Landing on Chat after sign-in** was considered. Home is where "your turn" lives, and approving is the centre of how Farbaek works; moving people past it is a change to make with the one frame, not before it.
- **One frame for every page** (Chat's window, sidebar and stage for Home, Projects, Tasks and the rest) is the next part of this stage. It moves every page's chrome, so it gets its own step and its own look at every route.
- **One menu behind a plus button** in Chat's composer is part of that step too.

## Consequences

- The command palette, the desktop sidebar and deep links are untouched: every address still works.
- `app-nav.test.ts` checks the phone's rows: Projects is under More, and the four tab pages are not.
- Checked by using it at 390 and 1280 px: the switch, the remembered choice, the hand-off to Chat (the question is in Chat's box, nothing sent, nothing in the address), and the five tabs.
