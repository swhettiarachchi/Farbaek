# Stage 236: AutoSurvey, the checks and sources report

- **Date:** 2026-11-23
- **Branch:** `feat/stage-236-report`, from `feat/stage-235-jobs` (PR #298)
- **Decision:** ADR 0245
- **Migration:** none. **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`: provenance on everything, tested code calculates, a report never certifies, synthetic data labelled;
  - `farbaek-human-made` and `farbaek-ui`: plain words ("checks and sources", not "evidence"), mono only for fingerprints and codes, numbers in sentences.

## What the owner asked

The AutoSurvey brief's §15 lists a validation report among a plan's deliverables, and §16 asks that every output can be traced to its sources, the engines and the surveyor's decisions.

## What was built

- **`src/core/survey/export/report.ts`:**
  - `reportPages` lays the report out on A4 pages: it wraps, paginates, cuts a word too long for its line, and numbers the pages;
  - `sourceNotes` reads what an import recorded: the reduction, the traverse's closure and precision, and the rule chosen;
  - `filledCounts` counts items drawn from the field codes and items AI filled, and how many the surveyor confirmed.
- **`src/server/survey/report.ts`:**
  - `reportInputFor` gathers one version's records: coordinate system and confirmation, approval with its SHA-256, engines, sources, sketch summary, checks, versions and exports;
  - `exportName` names each kind of file in the project's history.
- **The export route:** a new kind, `report`. It is made for any readable version (blocking checks are what it reports), opens in the browser, is dated when made, and is recorded as an A4 portrait PDF with `content: "report"`.
- **The Export step:** a "Checks and sources report" link under the other files, and every file's link now names the version shown. The exports list names each file in words.

## Verified

- **`src/server/survey/report.test.ts`, 12 tests:**
  - an import's traverse said with its misclosure, signs, precision and rule; under half a millimetre, as the import says it; one left as shot, or closed exactly; a record that doesn't match left out;
  - who filled what, without leftover marks of removed items;
  - the sample's report holds its version, when it was made, its coordinate system, source SHA-256, every check's code and "This report certifies nothing.";
  - with 120 long findings, a 120-character project name, a 200-character file name and a name of narrow letters, every line, footer included, sits inside the margins on A4 pages, each page numbered "page n of N";
  - a sketch read summed up in one sentence, each outcome counted on its own;
  - why an approval no longer applies, and what approval confirms on a draft and on an approved plan;
  - a history cut at the page's limit said as such, never counted past it;
  - the PDF has one page for each page of the report;
  - export names.
- **In a browser, on the demo build:**
  - the Export step at phone width shows the link;
  - the route returns a 12.9 KB `application/pdf`, inline, named `SAMPLE-1-v1-draft-checks.pdf`;
  - Chrome's PDF viewer shows the page with its headings, the draft status, the source fingerprint and the footer.
- `pnpm typecheck`, lint on the changed files, and the demo build pass.

## Review

A fresh review agent read the stage after its checks passed and reproduced faults, all fixed above:

1. **An unreadable version got a report of the defaults shown in its place,** as if they were that version. It's now refused with the reason.
2. **The footer wasn't cut,** so a long project name ran off the page. The name now gives way to the page number.
3. **"AI only reads documents and sketches and suggests text" was false:** AI drafting and the drafting assistant choose which points make lots, roads and lines. The report now says what AI does and what tested code does, and that coordinates are the files' own.
4. **"And N more" counted past the page's read limits** (100 versions, 50 exports). The report now says older ones weren't read.
5. **The PDF was dated as the version,** though its checks are as they stand when it's made. It's dated now and says when it was made.
6. **The export record held the plan's paper and scale.** It now records the report's own A4 portrait.
7. **Sketch readings within the usual measuring difference counted as agreeing, and unknown point numbers as unchecked.** Each outcome is now counted on its own.
8. **A misclosure under half a millimetre printed as zeros with a huge precision,** and a cut word's ellipsis could pass the margin. Both fixed.

From its lower-priority list: a lapsed approval now says why, "approval confirms the rest" says when on a draft, the draft's engine version (not recorded with a document) is no longer named as the current one, and the Export step's links name the version shown.

## Not done, and why

- **Documents and DXF files aren't kept** (ADR 0240), so the report can't list them.
- **The report hasn't been made from a real project.** The demo workspace holds only the sample.
