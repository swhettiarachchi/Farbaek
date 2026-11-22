# Stage 213, part 1: one registry of the models Farbaek uses

- **Date:** 2026-11-22
- **Branch:** `feat/stage-213-model-registry`, from `main`
- **Decision:** ADR 0229
- **Migration:** none. **New dependency:** none.

## What was built

- **`src/core/ai/model-registry.ts`:** every model in one list, with who makes it, what it produces, what Farbaek uses it for, its tiers, Chat's line for it, and the day its price was last read. It reads tiers and names from where they are decided and adds only the facts no file held.
- **Questions it answers:** `registeredModel(id)`, `modelsWith({ provider, makes, role, tier })`, `providersFor(role)` (who can stand in for whom) and `pricesToCheck(today)` (prices with no date, or one older than 90 days).
- **`docs/farbaek/FARBAEK_MODEL_REGISTRY.md`:** written from the code by `model-registry-doc.ts`, prices included.

## Verified

- `src/core/ai/model-registry.test.ts`, 13 tests:
  - the registry lists exactly the models that are named and priced;
  - it agrees with the rate card on each provider and name;
  - every ladder model is on the tiers its ladder gives it, and Chat's models are exactly the ones marked for Chat;
  - picture and video models sit on no text tier;
  - an unknown id returns nothing;
  - which uses have a stand-in and which have one provider;
  - when a price needs reading again, at the 90 and 91 day line;
  - the page equals what the code writes.
- The model, chat, billing and agent tests together: 558 passed. `pnpm typecheck` and lint on `src/core/ai`: clean.
- The full suite and the production build were not run again for this part: it adds files and changes none that existing code imports.

## What the first run found

A price read exactly 90 days ago was reported as due when the check ran at midday, because the age was counted in milliseconds. It is counted in whole days now, so the hour of the check doesn't move the line.

## Not done

- The routers still decide from their own ladders; the registry reads from them. Moving the decision is the next part, with Grok.
- Context size, release and retirement dates, speed and measured quality are not recorded: they have to be read from the providers' pages or measured, not written from memory.
- Seven prices have no date: the four Claude models and the three Gemini text models.
- Nothing shows `pricesToCheck` to staff yet.
