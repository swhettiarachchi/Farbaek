# Farbaek model registry

Every AI model Farbaek uses, written from the code by `src/core/ai/model-registry-doc.ts`. Don't edit this page by hand: change `src/core/ai/model-registry.ts` or `src/core/billing/rate-card.ts`, then run `WRITE_DOCS=1 pnpm exec vitest run src/core/ai/model-registry.test.ts`. A test fails when this page and the code disagree.

**What is here:** who makes each model, what it produces, what Farbaek uses it for, the tiers it answers at, its price per million tokens, and the day that price was last read from the provider's own pricing page.

**What is not here yet:** context size, release date, retirement date, speed and measured quality. Those have to be read from each provider's pages or measured, with the day they were read. A price marked "not recorded" has no date in the code; it and any price older than 90 days should be read again.

## Anthropic

| Model | Id | Makes | Used for | Tiers | Input | Output | Price read on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Claude Haiku 5.5 | `claude-haiku-5-5` | text | Chat, Build and drafting | fast | $0.1 | $0.5 | not recorded |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | text | Chat, Build and drafting | standard | $2 | $10 | not recorded |
| Claude Opus 5.5 | `claude-opus-5-5` | text | Chat, Build and drafting | strong | $4 | $20 | not recorded |
| Claude Fable 5.1 | `claude-fable-5-1` | text | Chat, Build and drafting | frontier | $10 | $50 | not recorded |

## OpenAI

| Model | Id | Makes | Used for | Tiers | Input | Output | Price read on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GPT-6 Luna | `gpt-6-luna` | text | Chat | fast | $0.1 | $0.5 | 2026-11-17 |
| GPT-6.1 Terra | `gpt-6.1-terra` | text | Chat, Second check | standard | $1 | $5 | 2026-10-30 |
| GPT-6.1 Sol | `gpt-6.1-sol` | text | Chat | standard, strong | $2 | $10 | 2026-11-17 |
| GPT-6 Astra | `gpt-6-astra` | text | Chat | frontier | $10 | $50 | 2026-11-17 |
| GPT Image 2.5 | `gpt-image-2.5-sunburst` | image | Image studio | none | $8 | $30 | 2026-11-17 |

## Google

| Model | Id | Makes | Used for | Tiers | Input | Output | Price read on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gemini 3.5 Flash-Lite | `gemini-3.5-flash-lite` | text | Build and drafting | fast | $0.3 | $2.5 | not recorded |
| Gemini 3.8 Flash | `gemini-3.8-flash` | text | Build and drafting | standard | $1.5 | $7.5 | not recorded |
| Gemini 4 Argon | `gemini-4-argon` | text | Build and drafting | strong, frontier | $4 | $20 | not recorded |
| Gemini 3.1 Flash Lite Image | `gemini-3.1-flash-lite-image` | image | Pictures in projects | none | $0.25 | $30 | 2026-10-28 |
| Gemini Omni 1.2 Flash | `gemini-omni-1.2-flash` | video | Video studio | none | $1.5 | $12 | 2026-11-17 |

## Who can stand in for whom

A use with one provider has no stand-in when that provider is down.

| Use | Providers |
| --- | --- |
| Chat | Anthropic, OpenAI |
| Build and drafting | Anthropic, Google |
| Second check | OpenAI |
| Image studio | OpenAI |
| Pictures in projects | Google |
| Video studio | Google |
