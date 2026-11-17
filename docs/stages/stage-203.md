# Stage 203: GPT-6 Luna first, and each question routed to a model that can answer it

- **Date:** 2026-11-17
- **Branch:** `feat/stage-203-luna-routing`
- **Decision:** ADR 0220
- **Migration:** none. **New dependency:** none.

## What the owner asked

Twice: Claude Haiku sometimes doesn't understand a question or answer it clearly and in enough detail. Use OpenAI and Claude together, send harder questions to stronger models, keep history across switches, fall back reliably, keep costs down without losing quality, avoid duplicate calls, keep one Farbaek AI identity, and make the model list easy to extend. Then: **GPT-6 Luna as the primary default model**, with Claude Haiku and the others kept as alternatives a person can switch to.

## What was built

- **Prices from OpenAI's own page** (developers.openai.com/api/docs/pricing, 2026-11-17): GPT-6 Luna $0.10 / $0.50 per million tokens (Haiku 5.5's price), GPT-6.1 Sol $2 / $10 (Sonnet's), GPT-6 Astra $10 / $50 (Fable's), GPT-6.1 Terra $1 / $5. Added to the rate card and `docs/billing/usage.md`, long prompts metered at 2x.
- **The model registry** `src/core/chat/ladder.ts`: every chat model on one ladder (fast, standard, strong, frontier), one from each provider per tier, and which provider leads for each kind of question.
- **The route** `src/core/chat/intelligence.ts`: reads the kind and difficulty for free; GPT-6 Luna first at the fast tier; a hard question, asking again, or a thumbs-down steps up; short follow-ups keep their tier; the plan's ceiling caps it, Free reaching standard only for a hard question; the provider that answered last keeps answering while the tier holds; asking again goes to the other provider; up to three candidates, ending on a fast model.
- **The turn** `src/server/chat/turn.ts`: hands the route the answer before the question and whether it's asked again; a continued answer keeps its model; each answer saves its kind, difficulty, tier and provider; the last-resort fallback tells the person a faster model answered.
- **OpenAI** `src/server/ai/chat-openai.ts`: sends the thinking effort the route chose (low for chat titles).
- **The picker**: Auto ("GPT-6 Luna first, and a stronger model when a question needs one"), then all eight models, fastest first, each available when the plan's tier includes it.

## Verified

- Unit tests: the question reader (kinds, hard, simple), and the route (Luna first on every plan; thinking; a hard question to the lead provider for its kind; Quick plus hard; plan ceilings never passed across every plan and style; Free's step-up; second opinion on asking again; thumbs-down; follow-up and stickiness; routing around a failing provider; own-key workspaces on Claude only; Claude-only and OpenAI-only servers; hand-picked models; at most three candidates, none twice).
- Turn tests: Luna busy and Haiku answering; three candidates in turn ending on a faster model, with the note; a question asked again going to Claude; a conversation kept on the provider its last answer recorded; nothing handed over once text has started; an own-key workspace never reaching OpenAI.
- The OpenAI adapter: the request carries `reasoning.effort` and `store: false`; thinking summaries reach the Thinking display when sent; a busy OpenAI reads as busy.
- Lint, type check and the design tests; on the final code the full suite (3,762 tests pass, 17 skipped) and the production build.

## A fresh review, and what it found

A second agent read the routing and the turn without having written them and probed them. It confirmed the reservation covers the costliest candidate, the plan ceilings hold, the prices match their ids, own-key workspaces never reach OpenAI and older answers still read. It found six real problems, all fixed and tested before the first commit:
- everyday messages read as hard ("open 24/7", "return a broken kettle", dates, URLs, "huh???"), which would have sent them to a model about 20 times the price: only real code and real maths count now;
- Free stepping up on a repeat, a thumbs-down or any short follow-up: Free steps up only for a question that reads as hard;
- continuing an answer showed "isn't available here" and rewrote its reason: it now keeps its model and reason quietly;
- own-key workspaces were offered GPT models: they now say why not, and Auto is described from what's connected;
- one fallback (or an older conversation) kept a conversation on Haiku: the fast tier always starts with Luna, and a fallback's provider isn't kept;
- the "second opinion" could come from the same model: the browser now names the answer being replaced, and the other provider answers.
Also from its list: a 400 from OpenAI about a setting or the model goes to Claude instead of failing every answer.

## Not verified

- Real answers from GPT-6 Luna, Sol, Terra or Astra through production: checked after the merge, in the owner's Chrome.
- Whether Luna's answers are clearer than Haiku's for the owner's questions: the ratings each answer now records will show it.

## Next

- Read the ratings by model and kind after a few weeks, and tune the lead table in `ladder.ts`.
