# ADR 0215: Farbaek AI, one assistant over several models

- **Status:** accepted (stage 201, 2026-11-17)
- **Builds on:** ADR 0009 (Claude behind an interface), ADR 0020 (metered AI usage), ADR 0021 (routing by tier), ADR 0121 (OpenAI for the second check), ADR 0125 (a workspace's own key), ADR 0213 (Farbaek Chat)
- **Changes:** ADR 0213's "each answer names the model that wrote it" (now one press away); ADR 0014's "no automatic switch to the other vendor" (now allowed for chat, on Farbaek's own keys, between providers the privacy policy names)

## Context

The owner wants people to use one product, Farbaek AI, rather than feel they are switching between OpenAI and Claude products. Behind it, the providers should work together: each request routed to the model best placed for it, by quality, speed and cost, with another taking over when one fails, usage and cost tracked, and room to add providers later.

What Farbaek had: Claude-first routing by plan tier (`route()`, ADR 0021), OpenAI's model only when Claude wasn't connected or picked by hand, no fallback between providers (ADR 0014 forbade it so data only went to the configured provider), and each answer labelled with its model's product name.

What the providers' terms say (checked 2026-11-17): Anthropic's usage policy asks consumer chat products to tell people they're talking to an AI, and says that disclosure "does not need to identify Anthropic, Claude, or the model used"; its commercial terms ask that people be warned output can be inaccurate. OpenAI's terms don't require naming the model, but don't allow using OpenAI's name in marketing without permission, and ask that shared output be labelled AI-generated.

## Decision

**One assistant, Farbaek AI.** The chat speaks as Farbaek AI. Each answer's footer says "Farbaek AI" and the time it thought; "Details" shows the model that answered and why it was chosen ("Answered by Claude Sonnet 5.5, chosen for a question about code"). The system prompt tells the model to speak as Farbaek AI, to say plainly which model and company are behind it when asked, and never to claim Farbaek trained it. The message box says "Farbaek AI can make mistakes. Check what matters." Public pages don't name OpenAI.

**An intelligence layer, `src/core/chat/intelligence.ts`.** Pure and tested:
- `readQuestion` reads what a question is mostly about (code, analysis, writing, everyday) from its words and files.
- `planChatRoute` returns the candidates in order: the model the person picked, when the plan includes it; otherwise Claude at the plan's tier for the answer style, with a little more thinking for code and analysis. A model from the other provider stands by on paid plans.
- A provider that's failing is routed around: `src/server/ai/provider-health.ts` rests a provider for two minutes after three failures in a row, in the server's memory.

**Fallback, inside the turn.** When the answering model fails for a provider reason (busy, an error) before writing a word, the next candidate takes the question. The stream sends a `route` event, the person sees "That model didn't answer, so Farbaek AI asked another", and the answer records the model that wrote it. An answer that has started is never handed over, and nothing is merged.

**Where it doesn't switch.** Not on the Free plan (one model, the cheapest), and never when a workspace answers on its own Claude key (ADR 0125): those questions stay on that key.

**Metering.** Unchanged in kind: the turn reserves enough for whichever candidate is the most expensive, and settles to the real cost of the model that answered.

## Consequences

- Chat data can now reach either Anthropic or OpenAI for the same question; the privacy policy says so.
- Each answer keeps why it was routed (`meta.route.why`, and `fallback` when it was handed over).
- Not done here: combining two models' answers in one reply, and routing by measured quality. Those need real data first.
- Adding a provider means a `ChatModel` for it (`src/server/ai/chat-model.ts`), a rate-card entry and a candidate in `planChatRoute`.
