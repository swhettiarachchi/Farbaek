# AutoSurvey benchmarks

The owner's AutoSurvey brief (§19) asks for reproducible benchmark datasets and measured timings for each stage of Generate Plan. Its engineering target, not a guarantee, is a first complete draft in under 30 seconds for a typical structured dataset.

## What is measured

The part of Generate Plan that tested code does, in one process, with no model called:

1. **Read the file:** detect the format, read every row, and for observations work out the points, including the traverse closure.
2. **Draw the draft:** the automatic draft from the field codes (lot, road, lines).
3. **Check and compose the plan:** the lots, every quality check and the plan sheet.
4. **Write the PDF:** the vector PDF at the plan's scale.
5. **Write the DXF:** the R12 drawing.

The datasets are **synthetic**, made up and reproducible from a fixed seed (`src/core/survey/bench/datasets.ts`):

- three points files of the same lot at 110, 320 and 3,070 points: boundary marks, a road's two edges, a fence, a wall, three buildings, posts and spot heights;
- a Sokkia SDR job with a closed five-station traverse and 60 detail shots from each station.

Run it again with `pnpm bench:survey`. It has its own config, so `pnpm test` never runs it.

## Not measured

- uploading the files;
- the database writes (creating the project, importing each file, saving the version);
- the job record;
- reading the sketches with Claude, which takes seconds to tens of seconds per run depending on the photos and the provider;
- the browser drawing the preview.

None of these is in the numbers below. The first real Generate Plan on production, with a real job, is what will show the whole time.

## Results

**2026-11-23, stage 232.** Machine: Intel Pentium Gold G6400 at 4.00 GHz, 4 threads, 7.8 GB, Node 24.13.1. Times are in milliseconds: the median of 9 runs after 2 warm-up runs, with the slowest in brackets.

| Dataset | Points | Shapes drawn | Findings | Read | Draft | Check and compose | PDF | DXF | All |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Small job | 110 | 3 | 11 | 0.7 (1.4) | 0.8 (1.2) | 5.8 (7.1) | 38 (47) | 0.3 (0.5) | 43 (64) |
| Typical job | 320 | 3 | 11 | 1.0 (1.5) | 0.7 (0.9) | 4.4 (9.0) | 32 (33) | 0.3 (6.3) | 40 (48) |
| Large job | 3,070 | 3 | 11 | 7.4 (11) | 2.8 (4.3) | 7.0 (13) | 32 (37) | 0.5 (1.1) | 49 (55) |
| Total station traverse | 306 | 0 | 11 | 2.2 (2.7) | 0.4 (0.4) | 0.7 (0.8) | 11 (13) | 0.1 (0.1) | 13 (18) |

### What the numbers say

- **The deterministic path takes well under a second,** even at 3,000 points on a low-end desktop CPU. The PDF, with its embedded fonts, is the largest share. The 30-second target is decided by the parts not measured here: the network, the database and the optional sketch reading. The sketch reading runs after the plan is drawn, so it never holds the draft back.
- **The traverse job draws nothing,** since its points carry no boundary codes. It measures reading and reducing observations and working out the traverse's closure.
- **The 11 findings are what a fresh draft asks the surveyor for:** the title block's fields (plan number, survey date, land name, village, district, province, previous plans, boundary description), the surveyor, and the code list to check. The points files' lot also has two inward corners to confirm, and the traverse job has no lot.
- **The DXF holds the plan's drawing,** not every surveyed point: lot boundaries and corners, lines, roads and labels. Spot heights and other points go out in the coordinates CSV. That is why the DXF time hardly changes with the number of spot heights.

These are lab timings on synthetic data. They show where the time goes, not what a surveyor will see end to end.
