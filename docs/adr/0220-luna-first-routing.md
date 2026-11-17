# ADR 0220: GPT-6 Luna first, and each question routed to a model that can answer it

- **Status:** accepted (stage 203, 2026-11-17)
- **Builds on:** ADR 0213 (Farbaek Chat), ADR 0215 (Farbaek AI's intelligence layer), ADR 0090 (runtime tier switches), ADR 0125 (a workspace's own Claude key), ADR 0019 and 0020 (usage metering)
- **Changes:** ADR 0215's "Claude first, OpenAI standing by"

## Context

The owner, twice on 2026-11-17: Claude Haiku "sometimes struggles to understand certain questions and provide clear, sufficiently detailed answers". They asked for OpenAI and Claude to be used together, harder questions sent to more capable models, and then specifically: "GPT-6 Luna must be the primary default model for the Farbaek chat system", with Claude Haiku and the other models kept as alternatives the person can choose, routing to another model when it suits a task better, history kept across switches, fallback, lower cost, no duplicate calls, one Farbaek AI identity, and a model configuration that's easy to extend.

Before this, Auto sent every question to one Claude model chosen by the plan and the answer style: Free, and anyone on Quick, always got Haiku. OpenAI only stood by for failures, never on Free, and the OpenAI adapter ignored how much thinking was asked for.

OpenAI's pricing page (read 2026-11-17) gives a model at each of Claude's price points: GPT-6 Luna at Haiku 5.5's $0.10 and $0.50 per million tokens, GPT-6.1 Sol at Sonnet 5.5's $2 and $10, GPT-6 Astra at Fable 5.1's $10 and $50, with GPT-6.1 Terra between at $1 and $5.

## Decision

**One ladder for both providers** (`src/core/chat/ladder.ts`): fast (Haiku, Luna), standard (Sonnet; Sol, or Terra for writing and pictures), strong (Opus; Sol thinking harder), frontier (Fable; Astra). A plan's tier ceiling (`maxTier`) bounds the cost of an answer whichever provider writes it. Adding a model is one entry there, plus its price and its name.

**GPT-6 Luna answers first.** Quick and Balanced start at the fast tier, where Luna leads for every kind of question with Haiku standing by; Thorough starts at standard.

**Harder questions step up, read for free.** `readQuestion` reads the kind (code, maths and reasoning, analysis, writing, everyday) and the difficulty (simple, moderate, hard) from the words and files, without a model call. Only real code and real maths count: words that are also everyday English ("return", "let", "class", "solve my argument", "algorithm"), dates, "24/7", fractions in a recipe and addresses don't. A hard question steps up a tier. On paid plans so do asking for an answer again and a thumbs-down on the last answer, and a short follow-up keeps the tier of the answer before it. The plan's ceiling caps the tier. **Free reaches the standard tier only for a question that reads as hard** (the plan the owner approved), inside its own $0.50 a month AI allowance, which metering enforces.

**The provider by what each says its models are for.** Above the fast tier: Claude first for code, analysis and long documents; OpenAI first for maths and step-by-step reasoning (Sol and Astra, "complex reasoning and coding" in OpenAI's words), writing and pictures (Terra, "visual reasoning ... clear, natural writing"). One table, to be tuned from ratings.

**No needless switching.** Above the fast tier, the provider that answered last keeps answering while the tier holds (also keeping prompt caches warm); at the fast tier GPT-6 Luna always leads, so one fallback or an older conversation never keeps someone on Haiku. Asking again goes to the other provider than the answer it replaces (the browser names it): a real second opinion. Continuing an answer keeps its model and its reason. Each answer records its kind, difficulty, tier and provider (a fallback's provider isn't kept as a preference), so the next question reads them and ratings can later be compared by model.

**Fallback.** Up to three candidates, tried only when one fails before writing a word: the first choice, the other provider at the same tier, then a fast model as the last resort, with the person told. A workspace on its own Claude key never leaves Claude (ADR 0125). Free gets a fallback too now, since Luna costs what Haiku does.

**History across switches** needed nothing new: every turn builds one provider-neutral history (`toModelInput`), with files and pictures, that both adapters read.

**OpenAI thinks when asked.** The adapter sends `reasoning: { effort }` from the route (low, medium or high; every GPT-6 model takes them). It doesn't ask for thinking summaries, which OpenAI can refuse for an organization it hasn't verified; it shows them when OpenAI sends them. If OpenAI ever rejects a setting or the model (a 400 that isn't about a file), the question goes to Claude instead of failing, so making Luna the default can't take chat down.

**One identity.** Answers are Farbaek AI's; Details names the model and why ("chosen for a hard maths or logic question", "a second opinion from another model").

## Consequences

- One model per answer: no asking two and merging. The reservation covers the costliest candidate, as before; settling charges what was really used.
- Paid plans' Balanced answers to everyday and moderate questions move from Claude Sonnet to GPT-6 Luna, which costs a twentieth as much per token; hard questions still reach Sonnet or Sol. The ratings recorded from now on show whether that holds up.
- The picker lists eight models, fastest first, each gated by the plan's tier. On a workspace's own Claude key the GPT models say why they can't be chosen, and Auto is described from what's connected.
- A runtime switch of the standard tier (ADR 0090) now also reaches Free's hard questions; the Free allowance still bounds what they cost.
- A fresh review found six real problems in the first version (everyday words read as hard, Free stepping up on follow-ups and repeats, a continued answer showing a wrong note, own-key workspaces offered GPT models, one fallback keeping a conversation on Haiku, the second opinion sometimes coming from the same model); all are fixed and tested.
- If OpenAI isn't connected, everything routes over Claude as before; if Claude isn't, over OpenAI.
