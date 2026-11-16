# ADR 0218: Chat's stage, and answers that hand off

- **Status:** accepted (stage 202, 2026-11-17)
- **Builds on:** ADR 0213 (Farbaek Chat), ADR 0216 (the studios), ADR 0217 (the spectrum), ADR 0055 (no filters), ADR 0172 (the motion budget), ADR 0056 (the Loom)

## Context

The homepage shows Farbaek AI's chat as a rounded window on a pale stage, with the spectrum's light behind its edges, the four spaces in colour in its sidebar and chips under an answer that hand the request to Images, Video or Build. The owner asked whether the real Chat looks like that. It didn't: it was a plain full-screen chat with grey icons, and the chips didn't exist, although the caption says the picture is "drawn from Farbaek AI's chat". The owner then asked for the real Chat to take the picture's idea further: playful and professional, with 3D, animation and refined light, on every screen, and never "another generic AI chat layout".

## Decision

**The product catches up with its picture, and then goes past it.**

- **A window on a stage of light.** From 1024 px, Chat is a rounded window (28 px) on a pale stage, and the spectrum glows from behind its edges: one conic gradient on a square larger than the screen, faded into the stage at the screen's edge. It is still. While Farbaek AI is answering, it turns slowly, so the light travels round the window; when the answer ends it stops where it is. That is motion for live state, and the only loop this adds. The stylesheet reads the state from the page itself (`.chat-root:has([aria-busy="true"])`), so no extra state is kept. Phones and tablets stay edge to edge.
- **The sidebar** says "Farbaek AI", has a light New chat pill, and lists the four spaces with their coloured icons (Chat blue, Images rose, Video aqua, Build leaf). Chat's own gallery is now called "Pictures from chats", so there aren't two things called Images. The current chat is a white pill.
- **The welcome screen** has the knight in his Loom (`HeroVisual`: drawn in 2D everywhere, in 3D on desktops that can afford it, one still frame under reduced motion), sized by the screen's height, and starter cards that each carry a colour and light up in it on hover.
- **Answers** have the knight beside them from 640 px, bare (the logo takes no plate or frame). While an answer is being written a small orbit turns round him, the same sign the agent's mark gives for work in progress (`core-orbit`). Answers rise in like the person's own messages.
- **Hand-off chips, for real.** Under the latest finished answer: Make a picture, Make a video, Build a website (one short word each on a phone). A chip opens that space with the last thing the person asked already in its box. The request waits in this browser's storage and never in the address (`handOffPlan` in `src/core/chat/handoff.ts`, tested), and nothing is made or charged until the person presses that space's own button. The chips show in the sample workspace too, because they only navigate.
- **The message box** has a soft pool of the spectrum under it while it is in use or an answer is being written, and a thin edge of it on focus. Both only fade.
- **Night.** Chat's dark theme gets night values for the four spectrum colours, each held to 4.5:1 on its surfaces by `tests/design/chat-theme.test.ts`.
- **The homepage's picture** now uses the product's words for the chips.

## Why this is allowed

ADR 0217 lets the spectrum be used in "the spaces' own chrome", for identity and light, and never for status. Chat is a space. Its working surfaces (messages, code, tables, menus, dialogs) stay neutral; the colour is in the sidebar's four icons, the chips' icons, the starter cards' icons and the light behind the window and under the message box. Status still comes only from `StatusBadge`'s kinds.

## Consequences

- No new dependency and no migration. The 3D scene is the one the homepage already loads, lazily and only on capable desktops.
- Everything that moves is under `prefers-reduced-motion: no-preference` or `motion-safe:`, and only `transform`, `rotate`, `scale` and `opacity` animate. No CSS filters.
- Build's link in Chat goes to the build box for now, and to Build's own workspace when that is built later in this stage.
- If another space wants the same stage, it takes these classes; the studios keep their own frame for now.
