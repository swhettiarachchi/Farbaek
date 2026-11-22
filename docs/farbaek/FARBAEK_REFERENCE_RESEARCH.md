# Farbaek reference research: six platforms, studied in a browser

- **Date:** 2026-11-22.
- **Why:** the owner asked for the leading AI products to be studied first, in a real browser, with screenshots, before any design or architecture decision for Farbaek.
- **How:** each page was opened in the owner's Chrome, signed in where the owner already was (ChatGPT on the Go plan, Claude on Max). Menus and dialogs were opened and closed without changing a setting. One research question was sent to ChatGPT, in a new chat called "AI Assistant UI Patterns". Phone-width pages were captured in the built-in browser at 375 px.
- **Screenshots:** 46 files in `research/reference-screenshots/`, named platform, page, state and width. They stay on this PC and are never committed: they show other companies' products and the owner's own chat titles.
- **Skills:** `chrome-browser` and `built-in-browser` for the visits. The design skills come in when these findings are applied (stage 211 on).

## What was and wasn't seen

| Platform | Seen | Not seen |
| --- | --- | --- |
| ChatGPT | Overview page; the app signed in: new chat, the tools menu, Think, profile menu, Settings (Appearance, Usage, Personalization), Scheduled and its new-task dialog, Plugins, Explore, Library; one real answer with sources | The app at phone width; voice; image creation; Deep research running; projects with content |
| Claude | Overview page; the app signed in: new chat, the add menu, model list, permission modes, Scheduled tasks, Plugins; Claude Code's new session; the Chrome docs page | The app at phone width; a running task; artifacts open |
| xAI | Home page; the tools overview and X Search documentation, read in full | The Grok app (not on the owner's list) |
| Google Antigravity | Home page; the docs overview with its interface previews and comparison table | The app itself (a download) |
| OpenAI Dots | The launch post with its product pictures; the help article, read in full | A dot: the owner's plan (Go) doesn't include one |
| Meta Muse | The product page; the newsroom post's headings | The app: it isn't offered in Sri Lanka |

The Chrome window couldn't be narrowed (it stayed 1920 px wide), so the two signed-in apps were studied at desktop width only. The phone screenshots are small, 163 px wide, because the built-in pane was scaled down. They show layout, not detail.

## What each platform does well

### ChatGPT

- **The empty state is one line and one box.** A short greeting, the composer under it, nothing else. Files: `chatgpt-app-01`.
- **One menu holds every tool.** The plus button opens a single list. Each row is an icon, a bold name and a grey hint of three or four words: add files, create an image, search the web, work in a project, research, sketch, think. Files: `chatgpt-app-02`.
- **Thinking is a toggle on the composer,** not a model to pick.
- **The sidebar has five items:** new chat, Scheduled, Library, Plugins, Explore. Then Projects, then Recents. The person and their plan sit at the bottom.
- **An answer is plain text in a 720 px column.** The person's message is a soft blue bubble on the right. The answer has no bubble. Sources are small grey chips right after the sentence they support, and a list of sources with link arrows ends the answer. Under it: copy, read aloud, share, more. Files: `chatgpt-app-12`, `chatgpt-app-13`.
- **Scheduled is a first-class page.** Its empty state offers six examples, each written as the person's own request ("Send me a daily roundup of news on topics I care about"). The new-task dialog has four rows: repeat or not, how often, what time, when to stop. Files: `chatgpt-app-07`, `chatgpt-app-08`.
- **Settings is one dialog** with a search box and grouped sections on the left. Each setting is a row: a name, a grey sentence, and its control on the right. Files: `chatgpt-app-04` to `06`.
- **Appearance offers light, dark or system as three pictures,** then a theme, an accent, and the background and text colours. Its light theme is #FCFCFC with #0D0D0D text.
- **Usage is one bar:** percent remaining and when it resets.
- **The overview page** puts a product window directly under the headline, colours one word of the headline, and switches between Chat, Work and Codex with three plain labels on the left.

### Claude

- **Two products share one frame.** A switch at the top of the sidebar moves between Claude and Code; the sidebar and composer stay where they are. Files: `claude-app-01`, `claude-code-01`.
- **The model list explains itself.** Each model has a name and one line saying what it is for. Effort is a second choice in the same menu. Files: `claude-app-03`.
- **Permission is two plain choices.** Manual: it asks before using new tools or opening new sites. Auto: it runs on its own and pauses to ask if anything looks unsafe. One sentence each. Files: `claude-app-04`.
- **The add menu shows connection state inline.** A connector that isn't connected says so and offers Connect in the same row. Things that are on have a tick.
- **Scheduled tasks** has Yours and Templates. Each template shows when it runs and a small sample of what it produces. Files: `claude-app-05`.
- **Plugins is a flat list in two columns,** with a filter for connectors and skills. No cards. Files: `claude-app-06`.
- **Claude Code's composer has a status row under it:** where it runs, the repository, the branch, the model, the permission mode.
- **The brand** is warm cream, a serif for headlines and a terracotta mark. It is the opposite of ChatGPT's white and black, and just as calm.

### xAI

- **The home page shows five products as tiles,** each a small live window: Chat, Build, Bot, Imagine, Voice. Each has its name bottom left and Explore bottom right. Files: `xai-home-02`.
- **The headline types its last word,** changing it every few seconds.
- **The docs** have three columns and two small actions by every title: copy the page for a model, and view it as Markdown.
- **X Search, read first-hand** (last updated 2026-10-10):
  - the model chooses among keyword search, search by meaning, user search and fetching a thread;
  - it takes handles to include or exclude (20 at most, not both), a date range, and switches for reading images and videos;
  - it costs $5 per thousand posts fetched and $10 per thousand profiles, on top of tokens;
  - every response reports how many posts and profiles it fetched, and the same post fetched twice counts twice;
  - a limit on rounds of searching keeps the cost down.

### Google Antigravity

- **One agent, four surfaces:** a desktop app that is a command center for agents working side by side, a terminal client, extensions for six editors, and a Python kit.
- **Work is checked through artifacts:** plans a person can comment on, one diff across files, and recordings of what the agent did in a browser.
- **Background agents each work in their own copy of the code,** so they don't block the person or each other.
- **Access is bounded:** approval gates per tool, a workspace folder the agent can't leave, and scheduled tasks.
- **The docs let you pick a surface and see its interface,** then compare all four in one table.
- **It offers other companies' models** beside Google's own.

### OpenAI Dots

- **The agent has a face, a name and its own colour.** A person picks a character or a pet. Files: `dots-post-02`, `dots-post-03`.
- **Chat on the left, the agent's computer on the right.** Under the computer: who has control, and a button to take over. Returning control is as easy.
- **Its profile sorts work into In progress, Scheduled and Completed.**
- **Every rule has four behaviours:** act without asking, act if the person asked for exactly this, ask first, or hand the step to the person. Asking for a draft is never approval to send it.
- **Some steps are always the person's,** such as changing a password.
- **Pause is one tap,** and says "Paused, tap to resume".
- **Its own computer is on by default; the person's computer is off** until they allow it, and can be revoked.
- **It is honest about limits:** it can make mistakes following rules, and a completed run should still be reviewed.

### Meta Muse

- **People name their agent,** and it has a soft character. Files: `muse-home-03`.
- **It feels like messaging:** bubbles, a "Send it" composer, and it also works in WhatsApp.
- **The promise is in one line that changes:** what Muse does while you do something else.
- **Trust has its own section:** a dedicated secure computer, a store for sign-ins, and a check before important actions such as sending an email or buying something.

## What they agree on

Where several of these products made the same choice, it is safe to treat it as what people now expect.

1. **The composer is the product.** The first screen is a greeting and a box.
2. **A short sidebar.** Five or six items, then projects, then recent chats.
3. **Scheduled work is a top-level item** in both ChatGPT and Claude, opened with examples a person can start from.
4. **Tools live behind one plus button,** each with a name and a short hint.
5. **Models are described by what they are for.** Nobody shows an id.
6. **Permission is said in sentences,** and the choices are few: two in Claude, four in Dots.
7. **Connectors are a plain list** with a state and one action per row.
8. **Settings is one dialog** with rows, not pages of cards.
9. **Usage is one bar** with a reset time.
10. **An agent that works alone shows its screen,** says who has control, and can be taken over, paused and resumed.
11. **Light is the default, and dark is the person's choice** (ChatGPT offers light, dark and system).
12. **Marketing pages show the real product** in the first screen.

## What this means for Farbaek

These are recommendations for the stages named. Nothing here is built yet.

| Finding | For Farbaek | Stage |
| --- | --- | --- |
| The composer is the product; the sidebar is short | Chat becomes the simple home. Today Home is Mission Control, Chat isn't a phone tab, and the app sidebar has 8 items plus 11 under More tools | 212 |
| Two products, one frame | Chat and Build share one frame with a switch, as Chat, Images, Video and the workbench already share one. "Build" opens one place, not three | 212 |
| One plus menu | Farbaek's composer gathers files, images, web research, a project and Build behind one menu, each with a hint | 212 |
| Models described by purpose | The model picker already shows product names. Add one line each on what the model is for | 213 |
| Light, dark or system as pictures | The choice for the whole product, shown the same way. Chat's dark values are the start. Crystal White's light stays close to what's there: Farbaek's canvas is #FBFBFC | 211 |
| Settings as one dialog with search | Farbaek's settings are pages. A search box and consistent rows would shorten them | 211 or 212 |
| Usage as one bar | Farbaek already shows a share and a reset date, and never units. Keep it | None |
| Scheduled as a top-level item with examples and a four-row dialog | The model for Farbaek's scheduler: Scheduled in the sidebar, six examples in the person's own words, a dialog of instructions, how often, when, and when to stop | 216 |
| Permission in sentences, few choices | Farbaek has five autonomy levels (0 to 4) with numbers. Offer them as two or three named choices with one sentence each, and keep the levels underneath | 216 |
| Four behaviours per rule; some steps always the person's | Close to Farbaek's allow, ask and refuse in the rules for computer tasks (ADR 0225). Add "only if I asked for exactly this", and keep the list of steps that are always the person's | 216 |
| Chat beside the agent's screen, with take over | The workbench already puts the agent beside the preview. A run's page should say who has control and offer take over, pause and resume in the same places | 217 |
| In progress, Scheduled, Completed | The three groups for the command center, with "needs you" first | 217 |
| A named agent with a face | Farbaek has the black-cat knight. A persistent agent can carry a name the person gives it. The knight stays the product's mark; whether agents get characters is the owner's call | 216 |
| X Search's price and counts | Live Intelligence must cap rounds of searching, narrow by handle and date, and meter posts fetched, not calls | 214 |
| Artifacts as verification | Farbaek's plans, diffs, ProofPacks and receipts are this already, and stronger: they're signed. Show them as one "what was done" view | 217 |
| Docs with copy-for-a-model and Markdown | For Farbaek's public docs pages | 221 |

## Where Farbaek can do better than what was seen

- **Proof.** None of the six shows signed evidence of what an agent did. Farbaek's ProofPacks and receipts do. This is the clearest difference to lead with.
- **Honest limits in the product.** Dots and Muse put their limits in help pages. Farbaek already says in the interface why a control is off.
- **A changed plan stops the work.** Farbaek halts a workflow when a step's plan changes after approval. None of the references describes this.
- **Sinhala and Singlish.** Farbaek measures them. None of the six pages mentions either.
- **One memory a person can read.** Dots can't show or delete single memories; only deleting the dot removes them. Farbaek's Chat memory is a list a person can read and remove from.

## What ChatGPT said, and how far to trust it

Asked which interface patterns make an assistant simple for a first-time user while keeping advanced tools, it listed progressive disclosure, a guided first experience, an interface that adapts, contextual toolbars, visible activity and user control. It named Nielsen Norman Group, Microsoft's guidelines for human-AI interaction and Google's People + AI Guidebook as sources.

Two cautions:
- It also recommended "three experience levels: Standard, Advanced and Professional" and named Farbaek. That came from its memory of the owner's earlier chats, not from the sources. It is the owner's idea returned, and none of the six products studied has such modes: they use one interface that reveals more as it's needed.
- The sources were named, not read here. They should be read before being cited.

## Not done yet

- The signed-in apps at phone width.
- Voice, image creation and deep research in use.
- The Grok app.
- Original images for Farbaek made with ChatGPT: none was needed for a study. They belong with the redesign, one at a time, when a page needs one.
- The five research notes on providers and prices that were cut off (see `FARBAEK_IMPLEMENTATION_PROGRESS.md`).
