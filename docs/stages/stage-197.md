# Stage 197: Survey Studio's AI is free while it's tested

- **Branch:** `feat/stage-197-survey-ai-free`, from main after #259 (stage 196) went live.
- **Migration:** v97, `supabase/migrations/20270107090000_survey_free_ai.sql`. The owner applies it before the merge: the new code calls its function.
- **Why:** the owner asked for the AI Surveyor to be free for every user while it's in development and testing, with no subscription and no extra fees, and pricing introduced once it's ready.
- **Decision:** [ADR 0212](../adr/0212-survey-ai-free-while-tested.md).

## What was found

- Survey Studio has no plan gate. Its three AI operations (`survey_draft`, `survey_read`, `survey_assist`) drew from the workspace's AI allowance, so a Free workspace could run out ("Choose a plan to keep using AI", 402), and an unreadable plan stopped them ("Your plan could not be confirmed").
- Free means Farbaek's own Claude credit pays, which is fixed each month. So free use needs its own limit, and has to stay in the ledger the owner's alerts and Office Space read.

## Done

1. **Migration v97:**
   - `ai_credit_ledger.free`;
   - `app_reserve_free_usage`: the survey operations only, the same checks as a paid reservation, the platform's daily limit, a daily limit on free use, and nothing drawn from the workspace;
   - `app_settle_usage` settles and refunds a free entry without grants and keeps its real cost; a free entry can't be a free retry; everything else is unchanged;
   - every daily total counts free entries in every status, since Farbaek paid for them: the platform's limit in `app_reserve_usage` too, and the spend alerts' `app_platform_ai_units_today`.
2. **Server:**
   - `FREE_WHILE_TESTING` names the free operations;
   - `resolveMetering` and `reserveMetered` send them to the free reservation, with no plan read and models routed as the trial (Sonnet for drafts and photo reads, Haiku for the assistant);
   - `SURVEY_AI_FREE_DAILY_USD` ($3 a day by default) sets the free limit, and `FREE_DAILY_LIMIT` says it in plain words (429);
   - per person per UTC day on Farbaek's key: 300 instructions, 20 drafts, 20 photo reads, counted after the cheap checks;
   - a workspace with its own Claude key keeps using it, logged as its own use, with no per-person limit, and its screens say so instead of "free".
3. **Pages:**
   - the Draft step's buttons say "Free while Survey Studio is being tested.";
   - the assistant's settings say its AI is free while Survey Studio is being tested;
   - the public Survey Studio page says so once;
   - the buttons no longer need a plan or allowance, and are still off for the demo, the Sample, viewers, writes off, no Claude and a staff pause.
4. **Records:** ADR 0212, `docs/billing/usage.md`, `docs/survey/ASSISTANT.md`, `AI_DRAFTING.md`, `API_SPECIFICATION.md`, `docs/architecture/current-state.md`, `.env.example` and `deploy/vps/production.env.example`.

## Verified

- **Unit tests** with fake models (nothing calls a real one):
  - the assistant and drafts reserve free entries, read no plan (billing returns nothing and isn't asked), and route Haiku and Sonnet;
  - `FREE_DAILY_LIMIT` and `PLATFORM_DAILY_LIMIT` stop a turn before the model is asked;
  - every other operation still reads the plan and fails closed without it;
  - availability is on for free use with no plan or allowance, and off for the honest reasons;
  - the free limit's setting;
  - own-key metering keeps free calls on the workspace's key.
- **PGlite (`tests/db/survey-studio.test.ts`):**
  - free reservations for each survey operation leave the wallet unchanged;
  - settling over and under the reservation, and refunding, draw and release nothing, with the real cost kept;
  - the platform's limit counts free entries; the free limit counts only free ones;
  - other operations, other workspaces, viewers, bad sizes and repeated keys are refused;
  - a suspended workspace and a staff pause of AI are refused by the ledger's trigger;
  - anon and authenticated can't call it or change `free`;
  - a refunded free call counts toward the free limit, the platform's limit in both reservations, and the alerts; a paid refund still doesn't;
  - a free entry can't be refunded as a free retry;
  - `ai-credits`, `launch-guards`, `platform-alerts`, `office-controls` and `fix-retries` (the paid path, the limits and the alerts) still pass unchanged.
- **A fresh review** of the migration and the metering found that refunded free calls weren't counted toward the limits, that own-key workspaces met Farbaek's per-person limits and "free" wording, and that the day's count came before cheap checks. All fixed, with tests.

## Next

- The owner applies v97 with `scripts/vps/apply-migration.ps1`, and the read-back is recorded. Then the merge.
- After the deploy: `/api/health` shows the merge's build, `check-ai.ps1` answers 200, and on a Free workspace a draft and an assistant turn work while the workspace's AI usage doesn't move.
- Pricing: when Survey Studio is ready, empty `FREE_WHILE_TESTING` and decide its place in the plans, with notice to users first.
