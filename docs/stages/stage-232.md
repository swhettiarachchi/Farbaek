# Stage 232: AutoSurvey benchmark: synthetic datasets and measured timings

- **Date:** 2026-11-23
- **Branch:** `feat/stage-231-traverse` (with stage 231)
- **Decision:** none new. The owner's brief §19 asks for reproducible benchmark datasets and measured timings, and §28 for real benchmark results.
- **Migration:** none. **New dependency:** none.
- **Skills used:** `farbaek-survey-studio`: rule 14 (label synthetic data as such) and the testing guide's "never claim accuracy from synthetic demonstrations".

## What was built

- **`src/core/survey/bench/datasets.ts`:** synthetic datasets, reproducible from a fixed seed.
  - The same lot at 110, 320 and 3,070 points: boundary marks, a road's two edges, a fence, a wall, buildings, posts and spot heights.
  - A Sokkia SDR job: a five-station closed traverse with uneven legs, and 60 shots from each station.
- **`tests/bench/autosurvey.bench.ts`,** run with `pnpm bench:survey` under its own config (`vitest.bench.config.mts`), so `pnpm test` never runs it.
  - It times the five steps tested code does in Generate Plan: read, draft, check and compose, PDF, DXF, and all five together.
  - Each timing is the median of 9 runs after 2 warm-up runs, with the slowest beside it.
  - It checks the plan isn't empty before timing it.
- **`docs/survey/BENCHMARKS.md`:** the results, the machine, what is measured and what isn't.

## Measured

On this PC (Pentium Gold G6400, 4 threads, 7.8 GB), the deterministic path takes about 40 ms for the typical job and about 50 ms at 3,070 points. The PDF is most of that. Uploads, database writes and sketch reading aren't measured. They decide whether the brief's 30-second target is met, and only a real run on production will show them.

## Found on the way, and fixed

- **The traverse closure's wording.** A loop that closes within the file's own rounding read "0.000 m out (easting -0.000 m ...), 1 in 53,908,256,389". It now reads "within half a millimetre over 299.99 m", and a value that rounds to zero has no sign. A test covers it (stage 231's `traverse.test.ts`).
- **The DXF holds the plan's drawing, not every surveyed point.** That means lot corners, lines, roads and labels; spot heights go out in the coordinates CSV. This is now said in the benchmark notes and in the final report.

## Not done, and why

- **No end-to-end timing on production:** that needs a real job and a real run, which are the owner's.
- **No timing of sketch reading:** it calls Claude, and is paid per run once Survey Studio's free test ends.
