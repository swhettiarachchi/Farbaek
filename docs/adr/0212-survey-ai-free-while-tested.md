# ADR 0212: Survey Studio's AI is free while it's being tested

- **Status:** accepted (stage 197, 2026-11-16)
- **Builds on:** ADR 0020 (metered AI usage), ADR 0065 (the platform's daily AI limit), ADR 0125 (a workspace's own model key), ADR 0202 (Survey Studio's AI drafts), ADR 0210 (the drafting assistant)
- **Changes:** how `survey_draft`, `survey_read` and `survey_assist` are paid for, until pricing for them is decided

## Context

The owner asked for the AI Surveyor to be free for every user while it's being developed and tested: no subscription, no plan and no extra fees to use it. Pricing comes back once the feature is ready for production.

Survey Studio has no plan gate of its own. Its three AI operations draw from the workspace's AI allowance like every other AI action, so a Free workspace can run out, and a workspace whose plan can't be read is refused ("Your plan could not be confirmed"). Those were the only things standing between a surveyor and the feature.

"Free" is paid from Farbaek's own Claude credit, which is fixed each month, with automatic top-ups off on purpose. Free use therefore has to stay bounded, and visible to the owner in Office Space and in the spend alerts.

## Decision

**Free, on the ledger.** The three operations are named in one list, `FREE_WHILE_TESTING` in `src/config/usage.ts`. For them, the server:
- reads no plan;
- routes models as the trial does, so every tester sees the real quality: Sonnet for drafts and photo reads, Haiku for the assistant;
- reserves with `app_reserve_free_usage` (migration v97).

That function makes the same checks as `app_reserve_usage`: the workspace lock, a contributor, the size, a repeated key, the platform's daily limit, and the ledger's insert trigger (a suspended workspace, a staff pause of AI). It then writes a ledger entry marked `free`, with no grants, and draws nothing from the workspace. `app_settle_usage` settles or refunds a free entry without touching grants, keeping the real cost in `credits`. A free entry can't be refunded as a free retry, and free entries stay out of the workspace's free-retry allowance. Every other entry behaves exactly as before.

**Bounded three ways.** A free entry is Farbaek's cost whatever becomes of it: refunded or not, Farbaek paid the provider. So every daily total counts free entries in every status, and paid entries as before (reserved or settled). That's the platform's limit in both reservation functions, the free limit, and the owner's spend alerts (`app_platform_ai_units_today`).
- **The platform's daily limit** (`AI_DAILY_LIMIT_USD`, $20 by default) counts free entries with the rest.
- **A daily limit on free use across all workspaces** (`SURVEY_AI_FREE_DAILY_USD`, $3 by default, "off" to lift it) keeps Survey Studio's testers from spending what the rest of Farbaek needs. When it's reached: "Survey Studio's free AI has reached today's limit while it's being tested. It's back tomorrow; everything without AI still works." (429).
- **Per person, per UTC day, on Farbaek's key,** through `app_rate_limit`: 300 assistant instructions (beside the 20 a minute already there), 20 drafts and 20 photo reads. They're counted after the cheap checks, just before the call.

**Visible.** Free entries stay in the ledger. The spend alerts count them in every status. Office Space's AI cost figures count settled entries, free ones included, as they always have; a refunded free call shows in the limits and the alerts, not in Office's chart. A workspace's own usage share doesn't move.

**A workspace's own key stays its own.** A workspace that set its own Claude key (ADR 0125) chose to run all its AI on that key, including for data-handling reasons. Survey Studio keeps to that, as the spec asks ("never silently switch providers"): its calls go on the workspace's key, logged as its own use, never count toward Farbaek's free limits, and have no per-person daily limit. Its screens say the AI runs on the workspace's own key, not that it's free. The approved plan had sent these calls to Farbaek's key; this was changed while building, so that a workspace's choice of where its data goes isn't overridden.

**Said where it's used.**
- The Draft step's buttons say "Free while Survey Studio is being tested." (or "Runs on your workspace's own Claude key.").
- The assistant's settings say its AI is free while Survey Studio is being tested (or runs on the workspace's own key).
- The public Survey Studio page says so once, beside where to start.

The buttons are off only for honest reasons: the demo and the Sample, a viewer, a workspace with changes off, no Claude on the server, or a staff pause.

## How pricing comes back

Empty `FREE_WHILE_TESTING`, decide each operation's place in the plans, and change the words above. The paid path (`resolveMetering` and `reserveMetered` in `src/server/workspace/ai-usage.ts`) is the one every other operation uses, so nothing else changes. The migration needs no undoing: `app_reserve_free_usage` is simply no longer called, and existing free entries stay in the record.

## Consequences

- At most about $90 a month of Farbaek's Claude credit can go to Survey Studio's testers at the default limit, refunded calls included, and only with heavy use. The owner can lower it, or lift it, with one setting and no deploy of code.
- A tester can be stopped by the day's shared free limit before their own. The message says why, and everything without AI still works.
- The free list is a promise to users. Before emptying it, tell them, and give notice in the product.
