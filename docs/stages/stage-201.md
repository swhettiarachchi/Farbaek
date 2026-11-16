# Stage 201: Farbaek AI, the image and video studios, and a chat-first platform

- **Date:** 2026-11-17
- **Branch:** `feat/stage-201-farbaek-ai` (built on `feat/stage-200-platform-spaces`, PR #263, not yet merged)
- **Decisions:** ADR 0215 (Farbaek AI's intelligence layer), ADR 0216 (the studios and the chat-first order)
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

## Verified

To be filled in with the results below.

## Not verified

- A real picture or video from the providers: the keys stay on the server, and the engines were tested against recorded replies.
- A real phone.

## Next

- The combined development workspace for vibe coding.
- Object storage for media, then share links and the account export for it.
- Masked edits on pictures, and extending a video.
