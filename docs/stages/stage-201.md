# Stage 201: Farbaek AI, the image and video studios, and a chat-first platform

- **Date:** 2026-11-17
- **Branch:** `feat/stage-201-farbaek-ai` (built on `feat/stage-200-platform-spaces`, PR #263, not yet merged)
- **Decisions:** ADR 0215 (Farbaek AI's intelligence layer), ADR 0216 (the studios and the chat-first order), ADR 0217 (the spectrum, and the knight back in the hero)
- **Migration:** v100, `supabase/migrations/20270110090000_creative_studios.sql`, SHA-256 `d1bc41e6eda9c283e9535bfe5d51b02756eba9b7151ed67eaeb8ba5149b1ebc4`. Apply and read back before the merge (below).

## What the owner asked

A complete rethink, with chat at the heart: one Farbaek AI identity over OpenAI and Claude, joined by an intelligence layer that routes, falls back and tracks cost; a homepage where chat leads and images, video and vibe coding have balanced, clear places; dedicated workspaces for image generation (studio quality, OpenAI), video generation (a real video model) and vibe coding; Survey Studio secondary; centred sections; no fake buttons.

## Research that shaped it

- **References:** ChatGPT's overview (a sentence and a product window that changes with it, a tour, use cases), its chat (one shell, a calm centred box, features as places in the sidebar), Google Antigravity (each surface its own panel), Claude (jobs, not features).
- **Providers, checked against their docs on 2026-11-17:** OpenAI's Sora API shut down on 2026-09-24 and Veo left the Gemini API on 2026-10-22; video now comes from Google's Gemini Omni 1.2 Flash on the Interactions API (about $0.07 a second at 720p, with sound). OpenAI's current image models are GPT Image 2.5 and 2.6; 2.5 takes custom sizes, so the studio uses it. Claude can't make images or video.
- **Terms:** Anthropic's usage policy asks only that people know it's AI ("does not need to identify Anthropic, Claude, or the model used") and that output may be wrong; OpenAI's don't allow its name in marketing without permission and ask that shared output be labelled AI-generated. So the brand is Farbaek AI, the model is one press away, the public pages don't name OpenAI, and downloads are named as AI-made.

## What was built

**Farbaek AI (ADR 0215).** `src/core/chat/intelligence.ts` reads what a question is about and plans the route: the model the person picked, or Claude at the plan's tier, with a little more thinking for code and analysis, and OpenAI's model standing by on paid plans. `src/server/ai/provider-health.ts` routes around a provider failing right now. In the turn, a model that fails before writing a word hands the question to the next, the person is told, and the answer records who wrote it. Never on Free, never on a workspace's own Claude key, never once an answer has started. Answers say "Farbaek AI"; Details shows the model and why. The system prompt speaks as Farbaek AI and answers plainly when asked which model is behind it.

**The studios (ADR 0216).** `/app/images` and `/app/video`, full-screen like Chat: a private library, a stage with first looks while pictures are made, and a dock with shapes, styles (each a professional brief), detail, references or a still, and Refine with Farbaek AI (the chat model writes the brief; another model renders it). A viewer downloads, shares where the browser can, edits, remakes, starts a video from a picture, or deletes. Migration v100 stores the media (base64 in Postgres, 500 MB per person), and video is metered as `video_generation`.

**The platform's order.** The homepage opens with a Farbaek AI message box (the question waits in the browser through sign-in and appears in Chat's box, ready to send), then a window onto Chat, Images, Video and Build, how one assistant uses many models, the recorded build, the safeguards, Survey Studio and Proof under "Also in Farbaek", pricing and questions. New public pages `/images` and `/video`. The header and phone menu lead with Chat, Images, Video and Build; the app's sidebar adds Images and Video and moves Survey Studio to the first of the tools. The search title is now "Farbaek AI: chat, images, video and vibe coding". The privacy policy says where chat, picture and video requests go.

**Vibe coding.** Kept as it is (the build box, plans, the agent, checks, Studio, test spaces) and given an equal place on the homepage and in the header. A single combined development workspace (agent chat, files, preview and terminal on one screen) is the next stage: it's large, and Build, Files, Design and Test space already work separately.

## Apply v100 before the merge

```
powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\apply-migration.ps1" -File "supabase\migrations\20270110090000_creative_studios.sql" -Sha256 d1bc41e6eda9c283e9535bfe5d51b02756eba9b7151ed67eaeb8ba5149b1ebc4 -Check "select to_regclass('public.studio_media') is not null"
```

Then `scripts/vps/check-migrations.ps1`, which now reads v100 back too.

## What the owner needs to set

- `OPENAI_API_KEY` is what makes pictures with OpenAI's model; without it the image studio uses Gemini, and without either it says it isn't connected. OpenAI may ask the organisation to verify itself before its image models answer.
- `GEMINI_API_KEY` on a paid Gemini account makes video (Omni has no free tier).

## The homepage, redone after the owner's review

The owner found the first pass oversized, unbalanced and cheap-looking, and asked for the references to be studied properly. They were measured in Chrome (`docs/research/homepage-references-2026-11.md`): ChatGPT's overview first (restraint, product first, a sticky tour, a rail of flat cards, flat grey bands), Antigravity second (lighter weight, very large media panels, motion that writes), Claude third (calm, small controls, a message box as the last word). The homepage was rebuilt from those measurements:

- Type down to size: the headline is 36, 52 and 64 px (was 83), section titles 26, 34 and 40 px (was 44).
- Flat white throughout: the dot grid, the pools of light and the gradient bands are gone. Depth only in the product windows and flat grey bands.
- A flat 64 px header with plain grey links and one dark pill, "Try Farbaek AI".
- The hero is two lines, one sentence and a quiet message box; under it, Farbaek AI itself in a window, with its sidebar and a sample conversation that writes itself as it comes into view, settling from a gentle 3D tilt as you scroll.
- A sticky tour of Chat, Images, Video and Build with one window crossfading between them (the Build window is a frame of the real recording); one band with a drawing of how a question finds its model; a rail of flat cards with a piece of each space; the recorded build; the safeguards as hairline cards; Survey Studio and Proof in one line; pricing as one band; the questions; and "Not sure where to start? Ask Farbaek AI." with the message box again.
- Fixed on the way: the footer's contact block had landed inside each link column in stage 200 and showed twice.

## Colour and the knight, after the owner's second review

The owner wanted the compact proportions kept but the page colourful and playful, with the cat knight and his hero animation back and better (ADR 0217). A second look at the references for colour: ChatGPT colours one word and a few props; Antigravity keeps interfaces neutral and glows colour from behind each product window on a pale stage.

- Four spectrum tokens (rose, aqua, leaf, ember), contrast-tested, for the spaces' identity and light, never for status.
- The hero: the knight in his Loom, centred and compact, lit by the spectrum and leaning toward the pointer; the verbs of the headline in the spaces' colours; one row of coloured chips under the message box; on wide screens four tilted cards, one per space, that link to it.
- Farbaek AI's window sits on a pale stage with the spectrum glowing behind its edges; each tour window glows in its space's colour; the routing drawing, the rail's cards and the last call (with the knight) carry the colours too.

## Compact on phones

The owner found the page too long and oversized on a phone, then asked for the knight to be larger there. On phones now: the knight is 208 px wide (springs in, sways as he floats, his light breathes, and he hops when tapped); the headline is 32 px and section titles 24 px; Farbaek AI's window has a two-column table that never scrolls sideways and one row of short offers; the four-space tour is one row to swipe instead of four tall blocks; the rail's cards are shorter; and every section's spacing is tighter. The hero, knight included, fits one phone screen.

## Verified

- Type check and lint clean. The full suite: 3,679 tests pass; the one failure (`tests/db/project-images.test.ts` used `video_generation` as its example of an unknown operation) was fixed to use one that still doesn't exist.
- Studio and chat tests: 1,804 tests across core, chat, studio, components and design; `tests/db/studio.test.ts` 8 of 8 after the review fixes.
- Production build (demo) succeeds. Next.js 16.4.2 now stops each build once to recommend a security upgrade; re-running continues. The upgrade is a dependency change for the owner to approve.
- `qa:a11y` on `/`, `/chat`, `/images`, `/video`, `/build`, `/proof`, `/app`, `/app/images`, `/app/video`, `/app/chat` at 1280 and 375: no findings.
- `qa:responsive` on the studios and the redone homepage at every size: no sideways scroll, cut content, small or lost taps, or out-of-proportion elements after the fixes.
- After the colour and phone passes: design tests 325 of 325, `qa:a11y` and `qa:responsive` clean on `/`, `/images` and `/build` from 320 px to 1280 px.
- `qa:vitals` (phone, before the redo): `/` LCP 1.87 s, TBT 185 ms; `/images` 1.55 s; `/video` 1.52 s; `/chat` 1.24 s.
- A fresh security review: no access holes; its money and abuse findings (room across workspaces, reclaiming a stopped server's renders, pictures paid for when the person stops watching, own-key routing, refine on Free, caps on provider streams, cache time) are fixed and tested.

## Not verified

- A real picture or video from the providers: the keys stay on the server, and the engines were tested against recorded replies.
- A real phone.

## Next

- The combined development workspace for vibe coding.
- Object storage for media, then share links and the account export for it.
- Masked edits on pictures, and extending a video.
