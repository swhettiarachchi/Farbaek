# AutoSurvey success metrics

The owner's AutoSurvey brief (§26) asks whether Farbaek really reduces a surveyor's work, and names its primary measure: how much of the surveyor's manual production work Farbaek eliminated without reducing technical correctness. It warns against vanity numbers such as AI calls or screens.

This page says how each of the brief's 13 metrics is measured today, or why it can't be yet. Production's numbers go at the end, under their date, once real plans have been generated. Nothing here is estimated.

## How production is read

`scripts/vps/autosurvey-metrics.ps1` (stage 237) reads production for the last 30 days in a read-only transaction that it rolls back. It prints counts, medians and the names of the AI models used, and nothing else: no project names, files, places or coordinates. A database test runs the script's own SQL against the migrations on synthetic data and checks every line it prints. It needs migration v102 (jobs).

Its companion, `scripts/vps/autosurvey-timings.ps1` (stage 235), gives each stage's time.

## The 13 metrics

| Brief's metric | How it's measured | Where |
| --- | --- | --- |
| Clicks from new project to generation | Counted from the screen, not tracked per person. A returning surveyor presses New survey, Choose files (or drags them in) and Generate Plan. A first plan also needs the coordinate system chosen once. | `/app/survey/new` |
| Time from upload to first useful preview | Not measured. The files are read in the browser as they're chosen, so what each holds shows before anything is uploaded, and the browser doesn't report its time. | none |
| Time from upload to complete draft | The server's import and drawing stages, added together, for runs that finished without a cut-off: their median. Upload time over the network isn't in it. | metrics script |
| Number of manual CAD edits | Versions saved after AutoSurvey's draft, other than one-press confirmations, near misses kept and sketch reads: their median per plan, and how many plans had none. | metrics script |
| Time spent fixing genuine issues | Approximated by the time from AutoSurvey's draft to the first approval, which includes any time the plan sat unopened: its median. | metrics script |
| Area calculation error against verified expected results | Known-answer tests, not production: areas, acre-rood-perch splits and bearings against worked answers, and every area checked again by an independent second method. | `src/core/survey/engine.test.ts` |
| Geometry validation results | Every plan is checked as it's shown (self-intersections, zero-length legs, corners on far legs, closure, area agreement), and the server refuses what a finding holds back: printing, approval, or both. Not counted across plans: the checks run on the current version as it's opened, and aren't stored. | `src/core/survey/qc.ts` |
| Number of unresolved critical errors | On an approved plan, none of the findings that hold back approval (the survey's coordinates, geometry and lots), since the server refuses approval while one stands. Errors in the sheet's layout, such as text running off the sheet, hold back printing instead, so an approved plan can still need one fixed before it prints. For drafts, not counted, as above. | `approveSurveyAction` |
| Export success rate | Plans with their plan PDF exported. Refused exports aren't recorded, so a rate over attempts can't be given. | metrics script |
| Processing failures | Runs stopped by a failed stage, and runs cut off. | metrics script |
| Job recovery | Runs finished after a cut-off (stage 235). | metrics script |
| Cost per generated plan | The deterministic path uses no AI. The only AI a generated plan can use is reading photos (sketches, or an old plan), so the script gives the number of reads, the refunded ones, the median tokens and the models. Turning tokens into money uses the rate card (`src/core/billing/rate-card.ts`). | metrics script |
| User actions per project | The confirmations, edits and exports after the draft: their medians. Pages opened and buttons pressed aren't tracked. | metrics script |

## The primary measure

No single number answers it. What the script gives toward it:

- **How much was left to do:** how many plans needed no edit after AutoSurvey's draft, and the median number of edits and confirmations.
- **Correctness kept:** every approved plan passed every check that holds back approval, and the calculations pass their known-answer tests.

What it can't give yet is the time a surveyor spent before Farbaek, to compare against. That needs the owner's surveyor to time a job they know, by hand and with AutoSurvey.

## Production's numbers

None yet. They go here, with their date, once real plans have been generated and the owner has run the script.
