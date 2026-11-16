# Stage 199: Farbaek Chat

- **Branch:** `feat/stage-199-chat-workspace`, from main after #261 (stage 198).
- **Migrations:** v98 (`20270108090000_chat_workspace.sql`, applied and read back 2026-11-16) and v99 (`20270109090000_chat_search_index.sql`, the search index), below.
- **Decision:** ADR 0213.
- **Why:** the owner asked for a ChatGPT-class AI chat inside Farbaek: premium, calm and complete, with real streaming, history, branches, files, images, voice, sharing, OpenAI and Claude, phone first, and dark mode, as its own module that fits the platform.

## Research

- **ChatGPT** (chatgpt.com/overview, 2026-11-16): a quiet sidebar (new chat, library, projects, recents), bubbles for the person and open text for answers, a slim action row (copy, rate, share, more), a composer carrying "+" for files, the model and its effort ("5.6 Sol Medium"), voice and send, and "Worked for 2m 30s" as a folded line above long answers.
- **Claude** (claude.com/product/overview): tasks, not just questions; the model and effort beside the composer ("Opus High"); the result next to the conversation; calm warm neutrals.
- **What Farbaek takes:** the composer as the product's centre, the model and answer style in it, a folded "Thinking" line with its summary, branch arrows on edited questions and new answers, and the actions only where the pointer is (always on touch). What it leaves: decoration, sparkles, a second accent.

## Design brief

- **Product and audience:** Farbaek Chat, for people building and running work in Farbaek (builders, small businesses, surveyors).
- **Feeling:** calm, precise, trustworthy.
- **Primary action:** ask (the composer) on every screen.
- **Platform and stack:** Next.js 16, React 19, Tailwind 4, Motion installed but CSS used (package.json).
- **Direction:** White Signal (Farbaek's own), light by default; Dark and Auto as the person's choice, for Chat only.
- **Dials:** motion 3/10, depth level 1 (layered shadows; glass only on the drop overlay and image controls), density standard.
- **Signature moment:** the first message: the composer glides from the welcome screen to the bottom (a view transition) while the question rises in and the knight marks the AI at work. Under reduced motion it simply appears.
- **Constraints:** ADR 0008, 0180, 0183, 0211; no CSS filters; no new dependencies; usage enforced on the server.

## Done

1. **Data (v98):** conversations, messages as a tree (`parent_id`, `leaf_id`), files, read-only links; owner-only row level security; `app_chat_*` functions for every write; `chat_path` reads a branch a page at a time with siblings and files; leaving a workspace deletes your chats; the account export includes them; the `chat` usage operation.
2. **Streaming:** `/app/chat/api/turn` answers refusals as JSON and only then streams `start`, `thinking`, `text`, `image`, `title`, `done`, with keep-alives; answers are saved every three seconds and at the end; Stop keeps what was written.
3. **Providers:** `ChatModel` with Claude (adaptive thinking with summaries, prompt caching, refusal fallbacks) and OpenAI (Responses API, `store: false`); Auto routes by plan and answer style; a chosen model the plan doesn't include is replaced, and the answer says so.
4. **Metering:** reserve before any write, settle to real cost (the AI-made name included), refund failures, pay only for what was written when stopped; images as `image_generation`; per-person limits per minute and day.
5. **Files and images:** pictures, PDFs and text checked by their bytes, up to 5 MB, six a message, with upload progress; large photos shrunk in the browser; images made with pictures to work from, a choice of seven shapes, a gallery, full-size view and download.
6. **Answers:** Farbaek's own Markdown parser (headings, lists, tasks, tables, quotes, code, links, maths) drawn as React elements, a light code tint with copy and download, MathML for maths; nothing from the model becomes HTML, and linked pictures are never loaded.
7. **Workspace UI:** full-screen frame (`AppFrame` steps aside), sidebar with search over names and messages, pinned chats, groups by date, project filters, archived chats with undo, images; header with share and actions; composer with files (button, paste, drop), voice, image mode, model and answer style, send and stop; welcome screen with the knight and six starters (four on phones); edit with branch arrows, answer again, continue, copy, read aloud, rate, report; share dialog (workspace or anyone, 7 days, 30 days or until turned off); settings (Light, Dark, Auto; Enter sends; usage; shortcuts); toasts that never take focus; the phone drawer you can drag shut; keyboard shortcuts.
8. **Navigation:** Chat in the desktop sidebar, a Chat button in the phone header, and a row on More.

## Checked

- `pnpm typecheck` and `pnpm lint` on the changed files: clean.
- Tests: `tests/db/chat.test.ts` (18, PGlite with every migration), `src/server/chat/turn.test.ts` (15), `src/core/chat/*.test.ts` (30), `src/components/chat/stream.test.ts` (3), `tests/design/*` with the new `chat-theme.test.ts` (WCAG AA for every dark pair). The full suite before the review fixes: 3,637 passed, 2 failed (the two guards below, since updated on purpose); after them the related groups: 50 files, 415 tests, all passed.
- Guards changed on purpose: the microphone is allowed on Chat's pages as well as Survey Studio's (`tests/security/permissions-policy.test.ts`), and signed-in browsers may call `chat_path`, a security-invoker read of their own rows (`tests/db/browser-grants.test.ts`). The plain-words test no longer reads a security header's directives as screen words.

## A fresh review, and what changed

A separate review of the risky files found no hole in row level security, grants, link scoping, file serving or rendering, and found eleven real bugs, all fixed:

1. **Stop during the server's preparation** still produced a full, charged answer: the route now stops at once when the browser has already gone, and the page reads the saved branch back instead of restoring its own copy.
2. **Stopped answers were under-charged** (OpenAI's context and Claude's thinking): a stopped answer now pays for its context and for what it thought (from its summary and how long it thought) as well as what it wrote.
3. **"Change it" on a picture never worked**: a picture made in the conversation is now a starting point for the next, never attached as a file.
4. **Continue in the middle of a branch** changed an answer under later questions, and "reached its length limit" stuck: only the last answer continues (checked in SQL too), and an ended answer's facts are written whole.
5. **A later Stop could stop working** when an earlier stream was still naming the chat: each turn clears only its own Stop.
6. **One unreadable file broke a conversation**: pictures over 8,000 pixels are refused at upload, large pictures are shrunk by size as well as weight, PDFs are known only by their first bytes, and a refused request is asked once more without earlier questions' files.
7. **Storage could be filled at no cost**: each person keeps up to 300 MB of chat files in a workspace.
8. **Answers left streaming by a stopped server** couldn't be continued or shared: answers are saved while the model thinks too, and anything untouched for two minutes is marked stopped before continuing, sharing or answering.
9. **Partial writes**: a question and its answer (and a new conversation) are now written in one transaction, `app_chat_begin_turn`.
10. **A rename during the first answer** was overwritten on screen: the AI's name is announced only when it was used.
11. **The account export** could outgrow one document: it carries the 500 most recently used chats, up to 2,000 messages each.
- In the built-in browser on the demo (dev server, Supabase off): the welcome screen at 1440 and 375, the sample chat's answer (headings, ordered list, table, inline maths, tasks, Python with tint, copy and download), the phone drawer and its account menu, settings, and Dark carried across pages by its cookie.
- `pnpm qa:a11y` on `/app/chat`, a chat and `/app/chat/images` at 1280 and 375: no findings (after starting answer headings at h2).
- `pnpm qa:responsive` on the same at 320, 375, 390, 430, 768, 1024, 1440 and 1920, and at 375 with text at 200%: no sideways scroll, nothing cut off, no small or lost taps, nothing out of proportion, no console errors (after fixes to touch areas, the task boxes and one padding).

## A second review (the PR), and what changed

1. **A chat shared with the workspace** couldn't see a teammate whose sign-in had timed out: `/share/chat/` now refreshes the session like the app.
2. **Buttons** now follow the system sizes: 40px with a mouse, 44px on touch (message actions, code blocks, the composer, toasts, the gallery).
3. **Searching messages** read every row in the database: an index on each person's messages (v99, since v98 was already applied).
4. **Naming a chat:** the AI gets room to think before naming it, and a chat whose first answer failed is named by the first one that finishes.
5. **Streaming long answers:** Markdown re-reads can skip a frame under load (a deferred value) instead of every frame.
6. **Menus** open in the right place while the iPhone keyboard has moved the chat.
7. **Read aloud** accepts any voice for the language, the device's own first (Android often has only network voices).
8. **One copy helper** instead of four.
9. Kept as is: "Answer this" asks in words, since a question can no longer be saved without its answer (one transaction), so the button is a safety net only.

## Not checked

- A real answer, picture or upload against a database: the local environment has no Supabase with v98, and the demo has sending off. The server's turn is covered by fake-provider tests; the first real turn should be watched on production after v98 and the merge.
- iPhone Safari's keyboard with the visual-viewport handling, on a real phone.
- OpenAI chat with a real key (only the request and event shapes are tested).

## Migrations

- **v98 is applied** (2026-11-16, `20270108090000_chat_workspace.sql`, SHA-256 `36593dd5…64ed`): the owner's apply line read back `t`, and `check-migrations.ps1` showed `v98 chat workspace|t` (and v90 to v97 all `t`, so Survey Studio's v97 is on production too).
- The PR review then added a search index to v98 (`fc0b37bd…3dff`); that line was refused, correctly, because v98 was already there, and nothing changed. So v98 in the repo is back to exactly what production has, and the index is its own migration, **v99** (`20270109090000_chat_search_index.sql`). Apply it, then read it back:

```
powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\apply-migration.ps1" -File "supabase\migrations\20270109090000_chat_search_index.sql" -Sha256 64f3e155506d9af2631564a1952b374dc7496a472bfee2658a048a223928ffcb -Check "select to_regclass('public.chat_messages_owner_idx') is not null"
```

Then `scripts/vps/check-migrations.ps1`, which now reads v99 back too.

**Done (2026-11-16):** v99 read back `t` (the index already existed, so `if not exists` skipped it), and `check-migrations.ps1` showed v90 to v99 all `t`. PR #262 merged the same evening.

## Next

- After v98 and the merge: send a message, stop one, edit one, make a picture and share a chat on production, and confirm `/api/health` shows the merge's build.
- A real iPhone check of the composer above the keyboard.
- Later: answers that search the web, tools, and live voice conversations.
