# Stage 237: AutoSurvey, measuring the brief's success metrics

- **Date:** 2026-11-23
- **Branch:** `feat/stage-237-metrics`, from `feat/stage-236-report`
- **Decision:** no new ADR: it reads what ADR 0239 (jobs), ADR 0244 (stage times) and the existing survey tables record. **Migration:** none (needs v102 on production, as before). **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`: no client land data leaves production in the numbers;
  - `farbaek-human-made`: numbers only when measured, said with what they mean.

## What the owner asked

The AutoSurvey brief's §26 names 13 metrics, and one primary measure: how much of the surveyor's manual production work Farbaek eliminated without reducing technical correctness. It asks not to chase vanity numbers.

## What was built

- **`scripts/vps/autosurvey-metrics.ps1`:** the owner's read-only query over the last 30 days. It prints counts and medians only:
  - plans generated, and drawn;
  - runs failed, cut off, and finished after a cut-off;
  - the server's time from upload to drawn plan;
  - edits and confirmations after the draft, and plans with no edit;
  - plans approved at least once, and the time from draft to the first approval;
  - plans with their plan PDF exported, and files per plan;
  - AI photo reads, refunds, tokens and models.
- **`docs/survey/METRICS.md`:** each of the 13 metrics, how it's measured or why it can't be yet, and where production's numbers will go.

## Verified

- **`tests/db/autosurvey-metrics.test.ts`:** the script's own SQL, run against the migrations in PGlite on four synthetic projects:
  - a drawn plan with a confirmation, an edit, a sketch read, an approval two hours later and two exports;
  - a drawn plan left as drawn, with only its report exported;
  - a failed run and a quiet one;
  - three AI reads, one refunded.

  It checks every line the script prints, and that it only reads, in a transaction it rolls back.

## Not done, and why

- **Time to first preview isn't measured:** files are read in the browser, which reports nothing.
- **Findings aren't counted across plans:** the checks run on the version as it's opened and aren't stored.
- **Refused exports aren't recorded,** so there's no export success rate over attempts.
- **The comparison with work by hand** needs the owner's surveyor to time a job they know, both ways.
- **Production's numbers** wait for real plans and the owner's run of the script.
