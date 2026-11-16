# ADR 0213: Farbaek Chat, the AI chat workspace

- **Status:** accepted (stage 199, 2026-11-16)
- **Builds on:** ADR 0008 (White Signal), ADR 0009 (Claude behind an interface), ADR 0014 (Gemini as a provider), ADR 0020 (metered AI usage), ADR 0109 (image generation), ADR 0121 (OpenAI for the second check), ADR 0125 (a workspace's own model key), ADR 0180 and 0183 (human-made UI, status), ADR 0188 (read-only links), ADR 0211 (sized phone first)
- **Changes:** adds a module; scopes an opt-in dark theme to it (White Signal stays the app's one theme); lets OpenAI answer chats as well as run the second check

## Context

The owner asked for a ChatGPT-class AI chat inside Farbaek: a premium, calm workspace with real streaming, history, branches, files, images, voice, sharing, a model picker for OpenAI and Claude, a mobile-first layout and a dark theme, built into the existing platform rather than beside it. Farbaek already had the pieces underneath (provider interfaces, a metered wallet with reserve and settle, a workspace's own key, rate limits, an image generator, read-only links, a voice recogniser) but nothing streamed tokens to a browser and there was no conversation store.

Constraints: no new paid services (the owner's budget), no new dependencies without asking, model output is untrusted, usage is enforced on the server, and nothing may look generated (ADR 0180).

## Decision

**A module of its own, inside the app.** Chat lives at `/app/chat` with a full-screen frame of its own: its own sidebar (a drawer on phones), header and composer. The app layout renders its usual frame through `AppFrame`, which steps aside on chat routes; everything else (session, CSP nonce, proxy, command palette) is shared. Chat is in the desktop navigation, the phone header and More.

**Private conversations, a tree of messages (migration v98).** `chat_conversations`, `chat_messages` (each with a parent, so an edited question or a new answer is a sibling branch, and `leaf_id` says which branch shows), `chat_attachments` and `chat_share_links`. Row level security shows a conversation only to the person who started it, while they're in the workspace; leaving the workspace deletes their chats. Writes go through `app_chat_*` service-role functions that check the contributor role and ownership. `chat_path` (security invoker) reads a branch a page at a time with each message's siblings and files. The account export includes chats.

**Streaming as Server-Sent Events.** `POST /app/chat/api/turn` checks everything that can refuse a turn (sign-in, role, same origin, body, per-person limits, the plan's usage) and answers those as JSON; only then does it open a `text/event-stream` with `start`, `thinking`, `text`, `image`, `title` and `done` events, and a keep-alive every 15 seconds. The browser reads it with `fetch` and flushes text once a frame. Stop aborts the request; the server aborts the model, keeps what was written, and saves it. A question and its empty answer are written in one transaction (`app_chat_begin_turn`). Answers are saved every three seconds while they stream or think, so a server that stops leaves a partial answer, marked stopped after two minutes untouched.

**One provider shape, two providers.** `ChatModel` (`src/server/ai/chat-model.ts`) streams one answer. Claude goes through the official SDK with adaptive thinking (summaries shown while it thinks, never stored), automatic prompt caching and refusal fallbacks; OpenAI goes through the Responses API with `store: false`, on the key the second check already uses. Auto picks through the same routing as every AI action (`route()` with the plan's tiers); a model chosen by hand is honoured only when the plan includes it, and the answer says when another was used. People talk to Farbaek; each answer names the model that wrote it by its product name.

**Metered like everything else.** A new operation, `chat`, reserves before any write, settles to the real cost (the conversation's AI-made name is paid with its first answer) and refunds a failure. A stopped answer pays for its context and for what it thought and wrote; providers report little for a stopped call, so thinking is counted from its summary and how long it lasted. Images use `image_generation` on Farbaek's Gemini key, with the question's pictures (or the last picture of the conversation) as references, so "make it brighter" edits it. Per person: 20 turns a minute and 800 a day, 6 pictures a minute and 80 a day, 120 uploads an hour, on top of the plan.

**Files by their bytes.** Pictures (PNG, JPEG, GIF, WebP, up to 8,000 pixels a side), PDFs and UTF-8 text up to 5 MB each, six to a question, are checked on the server by their content, stored as base64 like project images, and served back with `nosniff` and a sandboxing policy. Large photos are made smaller in the browser first. Each person keeps up to 300 MB of chat files in a workspace.

**Answers drawn, never injected.** The model's Markdown is read by Farbaek's own parser (`src/core/chat/markdown.ts`) into React elements: no HTML from the model, links only to http, https and mail addresses, and pictures the model links to shown as links, never loaded. Code gets a light tint without a parser library; maths is turned into MathML the browser draws. No dependency was added.

**Read-only links.** A link shares a snapshot of the branch showing, for people in the workspace (they sign in) or for anyone, for 7 or 30 days or until turned off. Only the SHA-256 of its token is stored, opens are counted per address, and the staff pause for links applies.

**Dark, for Chat only.** White Signal stays the app's one theme. Chat offers Light (the default), Dark and Auto as the person's choice, saved in a cookie so the first paint is right. Dark is the same token names with night values on the chat's root (`src/styles/chat-theme.css`), checked for WCAG AA by `tests/design/chat-theme.test.ts`. Signal blue stays the one accent. The owner's brief asked for a restrained gold; gold stays out of the UI (ADR 0008, ADR 0183) and appears where the brand already carries it, in the cat knight's armour: the logo leads the welcome screen and marks the AI while it works.

## Consequences

- Production needs migration v98 applied (and read back with `check-migrations.ps1`) before the merge.
- OpenAI answers only where `OPENAI_API_KEY` is set; Gemini images only where `GEMINI_API_KEY` is. Otherwise the picker and the image switch say so.
- Not done here: web search inside answers, tool use, voice conversations in real time, editing images by painting a region, and message search beyond names and plain text matches.
