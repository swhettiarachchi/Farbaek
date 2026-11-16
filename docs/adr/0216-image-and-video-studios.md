# ADR 0216: Farbaek AI's image and video studios, and a chat-first platform

- **Status:** accepted (stage 201, 2026-11-17)
- **Builds on:** ADR 0020 (metered AI usage), ADR 0109 (image generation), ADR 0188 (no object storage), ADR 0213 (Farbaek Chat), ADR 0214 (spaces), ADR 0215 (Farbaek AI)
- **Changes:** ADR 0214's homepage order and space list (Chat now leads; Images and Video join; Survey Studio and Proof become secondary)

## Context

The owner's brief after stage 200: Farbaek AI is one platform with chat at its heart. Image generation, video generation and vibe coding need balanced, clear places of their own; Survey Studio stays reachable but secondary. Images should look professionally made; video must use a real video model (Claude can only write and plan).

What the providers offer (checked 2026-11-17 against their docs and price pages):
- **Images:** OpenAI's GPT image models over the Images API (`gpt-image-2.5-sunburst` takes every shape the studio needs as a custom size; base64 output; streamed first looks; edits with up to 16 reference images; transparent PNG/WebP; about $30 per million output tokens). Google's Gemini image models over the Gemini API (already used by chat, ADR 0109).
- **Video:** OpenAI's Sora API shut down on 2026-09-24 with no replacement, and Veo left the Gemini API on 2026-10-22. Google's Gemini Omni 1.2 Flash, on the Interactions API with the Gemini key Farbaek already has, makes 3 to 15 second clips with sound, 16:9 or 9:16, 360p to 4K, from text or a picture, at about $0.07 a second at 720p. It returns when the video is ready, or by file address for larger ones.
- Farbaek has no object storage (ADR 0188); chat files and project images are base64 in Postgres.

## Decision

**Two studios, each a workspace of its own** at `/app/images` and `/app/video`, with Chat's full-screen frame (`AppFrame` steps aside for all three) and the same parts: the library on the left (a drawer on phones), the stage where results land, and a dock with the description and its controls. A switcher in the header moves between Chat, Images and Video.

**Images** (`src/core/studio/studio.ts`, `src/server/ai/openai-image.ts`, `src/server/studio/studio.ts`):
- Seven shapes made at their own sizes, four detail levels (low to xhigh quality), WebP, PNG (transparent or not) or JPEG, one to four pictures at once.
- Eight styles, each a written brief added after the person's words (light, lens, materials, finish), plus one craft line asking for coherent light, correct hands, faces and text, and no watermark. The briefs are shown on `/images`.
- Up to four of the person's own pictures to work from (edits and references), uploads checked by their bytes and shrunk in the browser first.
- Each picture streams a first look, is saved as it finishes, and the request settles to its real token cost; a request that makes nothing is refunded. OpenAI's model when its key is set, Gemini's otherwise.

**Video** (`src/server/ai/gemini-video.ts`): wide or vertical, 4 to 10 seconds, Draft (360p), Standard (720p) or High (1080p), six styles (cinematic, documentary, product film, animation, dithered, conversation), optionally from one of the person's pictures. A working row shows it in the library while it renders; it keeps rendering if the page closes; usage is metered as the new operation `video_generation` at the model's per-second tokens.

**Refine with Farbaek AI**: the chat's model rewrites a short idea as the brief a photographer, art director or cinematographer would write, for the person to read and change before anything is made. One model writes; another renders.

**Storage (migration v100)**: one table, `studio_media`, private to its owner in the workspace (row level security), base64 in Postgres: a picture up to 8 MB, a video up to 20 MB, 500 MB per person per workspace, three renders at once. Served by `/app/studio/media/[id]` with the saved type, sandboxed, with byte ranges so video seeks everywhere. Downloads are named as AI-made.

**Limits**: per person, 6 picture requests a minute and 60 a day, 3 videos a minute and 20 a day, 120 uploads an hour, 10 refinements a minute, on top of the plan's AI usage.

**The platform's order**: the spaces list now leads with Chat, then Images, Video and Build as equals; Survey Studio and Proof are marked secondary (the phone menu shows them as rows, the homepage under "Also in Farbaek", the app's sidebar keeps Survey Studio first among the tools). The homepage opens with a Farbaek AI message box: a visitor's question waits in their browser through sign-in (never in an address) and appears in Chat's box, ready to send. Public pages `/images` and `/video` explain each studio.

## Consequences

- Production needs migration v100 applied and read back before the merge.
- Pictures need `OPENAI_API_KEY` (or fall back to `GEMINI_API_KEY`); video needs `GEMINI_API_KEY` on a paid Gemini account. Without them each studio says so and the Make button is off. OpenAI may ask Farbaek's organisation to verify itself before its image models answer.
- Postgres holds the media for now. When object storage arrives, `studio_media.content` moves out and the serving route reads from there; the 500 MB room per person keeps the database's growth bounded until then.
- Not done here: painting a mask over part of a picture, extending or editing a video, sharing a public link to a picture or video, and the media in the account export (the person can download everything from their library).
