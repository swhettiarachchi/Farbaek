# 0021. Auto routing and the model gateway: Farbaek's own AI, no keys to bring

- Status: accepted
- Date: 2026-10-18
- Updates: ADR 0018 (the agent used the person's own model key), ADR 0009 and ADR 0011 (drafting and proposals were fixed to Claude Opus)

## Context

The owner wants a complete platform where people never bring an API key: Farbaek connects to the models and people pay one subscription (ADR 0020). Until now:
- the web app's AI drafting and proposals always used Claude Opus 5.5, whatever the plan;
- the desktop agent called Claude or Gemini directly with a key the person pasted into its Keys screen.

Plans differ in which models they include (Free fast models only, Opus from Pro, Fable from Max 2x), and most of an agent's work, such as reading files, searching and planning, doesn't need a frontier model.

## Decision

**Auto routing** (`src/core/agent/routing.ts`) picks the model for each step from the plan, the kind of step and an effort the person chooses:

| | Fast | Balanced (default) | Deep |
| --- | --- | --- | --- |
| Reading, planning (contract drafts) | Haiku 5.5 | Haiku 5.5 | Sonnet 5.5 |
| Writing code, reviewing (proposals, agent runs) | Haiku 5.5 | Sonnet 5.5 | The strongest model the plan includes |

- Plans cap the tier:
  - Free: fast only;
  - Starter and Plus: up to Sonnet;
  - Pro, Studio, Max and the trial: up to Opus 5.5;
  - Max 2x and Max 3x: Fable 5.1.
- Two failures in a row step Balanced up one tier, within the plan.
- From Pro up, a person may pin a model their plan includes. Anything else falls back to Auto with a note.
- On Gemini the same tiers map to Gemini 3.5 Flash-Lite, 3.8 Flash and 4 Argon.
- Routing always runs on the server, inside the use case, after the plan is resolved. The browser and the desktop app only express an effort.

**The model gateway** (`POST /api/v1/agent/model`, `src/server/agent/gateway.ts`) is how the desktop agent reaches a model:
- The agent sends its conversation for a task whose contract is approved.
- The agent acts for the person who paired it, who must be a contributor; the database checks this again when it reserves usage.
- Farbaek routes the step and reserves usage from the wallet. Earlier turns are priced as cache reads, the newest as a cache write, plus 16,000 output tokens.
- It calls Claude with Farbaek's key (adaptive thinking at the routed effort, automatic prompt caching, a fixed server note before the agent's instructions), settles to the real token cost and returns Claude's message unchanged, thinking blocks included.
- Refusals and provider failures are refunded in full.
- Only text, tool use, tool results and thinking blocks are accepted: no images, documents or server-side tools. Bodies are capped at 6 MB, and each agent at 30 steps a minute.
- Farbaek doesn't store the conversation; the ledger records the model and token counts.

The desktop app drops the Keys screen. Runs take an effort instead of a provider, show the share of the workspace's usage, and delete any key an earlier version stored.

## Consequences

- No one brings a key, and every AI call in Farbaek is metered from the workspace's wallet at its real cost.
- Project content an agent reads now passes through Farbaek's server on its way to Claude. The Agents page says so. The threat model gains the gateway as an entry point: it's authenticated by agent token, scoped to one task in one workspace, rate-limited and size-limited, and the server picks the model.
- The gateway speaks Claude's message format. With `AI_PROVIDER=gemini` it answers 503 until a Gemini path is added.
- Thinking blocks are bound to the model that wrote them. If routing changes the model mid-run, the next model runs without the earlier reasoning. Agent runs therefore keep one step kind ("write") for the whole run, so the model only changes when a failure steps it up.
- On Vercel, a step can exceed serverless time limits. The route asks for 300 seconds. Long agent runs need the long-running host the owner will provide.
