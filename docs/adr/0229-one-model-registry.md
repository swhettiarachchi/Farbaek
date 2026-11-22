# ADR 0229: One registry of the models Farbaek uses

- **Status:** accepted (stage 213, part 1, 2026-11-22)
- **Builds on:** ADR 0020 (usage and the rate card), ADR 0090 (model switches and the daily watch), ADR 0109 (pictures in projects), ADR 0121 (the second checker), ADR 0180 (product names), ADR 0216 (the studios), ADR 0220 (Chat's ladder)

## Context

The owner's brief asks for a model registry: one place that says which models Farbaek uses, what each is for and what it costs, kept current, so that routing never rests on a model being "the best" by habit.

The audit found a model's facts in five places: its name (`billing/model-names.ts`), its price (`billing/rate-card.ts`), its tier (`agent/routing.ts`), its place in Chat (`chat/ladder.ts`) and the feature that calls it (`server/ai`). Nothing tied them together. Adding a provider, as the brief asks for with Grok, would mean finding all five by memory, and a miss would show up as a wrong price or a model with no name.

Two facts were held nowhere as data: what each model is used for, and the day its price was last read from the provider's page. The second was written in comments for seven models and not at all for the other seven.

## Decision

**One list, `src/core/ai/model-registry.ts`**, with an entry for every model:

- who makes it, what it produces (text, image, video) and what Farbaek uses it for;
- its product name, the tiers it answers at, and the line Chat's picker shows;
- the day its price was last read from the provider's pricing page, or nothing when the code never recorded one.

**It reads, it doesn't copy.** The tier comes from the build ladder and from Chat's ladder; the name from the names list. Only the facts no file held are written in the registry itself. So there is still one place where each fact is decided.

**It can't drift.**

- The registry's facts are keyed by every model id, so a model added to the names without an entry stops the build.
- A test fails when the registry and the rate card disagree on a model's provider or name, when a model is on a ladder the registry doesn't show, or when Chat offers a model the registry doesn't mark for Chat.

**Prices carry a date.** `pricesToCheck(today)` lists the models whose price has no date or one older than 90 days. Today that is the seven with no date: the four Claude models and the three Gemini text models. Their prices are not known to be wrong; nobody recorded when they were read.

**The page is written from the code.** `docs/farbaek/FARBAEK_MODEL_REGISTRY.md` is generated, and a test fails when it and the code differ.

**No prices in the registry.** It is safe for a page's JavaScript. Prices stay in the rate card on the server; only the document builder joins them.

## What it shows today

- Chat and Build each have two providers, so each has a stand-in.
- The image studio, the video studio, pictures in projects and the second check each rest on one provider. When that provider is down the feature is off, and says so.

## What this part does not do

- **The routers don't read the registry yet.** Chat's ladder and the build ladder still decide as before; the registry reads from them. Moving the decision into the registry is the next part, and comes with Grok (stage 214), when a third chat provider makes it necessary.
- **No context size, release date, retirement date, speed or measured quality.** The brief asks for these. None is recorded anywhere in the code, and writing them from memory would be inventing them. They are to be read from each provider's pages with the day they were read, and quality measured on Farbaek's own tasks.
- **Nothing reads `pricesToCheck` yet.** It belongs on the staff console's models page beside the daily watch.

## Consequences

- Adding a model is now: its name, its price, its ladder entry where it has one, and its registry entry. The build or a test says which is missing.
- The seven undated prices should be read from Anthropic's and Google's pricing pages and dated.
