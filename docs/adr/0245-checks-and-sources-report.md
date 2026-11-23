# ADR 0245: A checks and sources report goes with every plan version

- **Status:** accepted (stage 236, AutoSurvey, 2026-11-23)
- **Builds on:** ADR 0198 (engine versions stamped on results), ADR 0233 (Generate Plan), ADR 0235 (exceptions only), ADR 0241 (traverse closure), ADR 0234 (sketches); the owner's AutoSurvey brief §15 (deliverables: a validation report beside the plan) and §16 (provenance: every output traceable to its sources, engines and the surveyor's decisions)
- **Changes:** a new export. No migration, no new dependency.

## Context

Everything a plan rests on was already recorded: each imported file byte for byte with its SHA-256, what was worked out from it (observations reduced, a traverse's closure and the rule chosen), who filled each item (tested code, AI, or the surveyor), the sketch read, every check, every version, every export with its fingerprint, and the approval's hash. It was spread across the steps of the project page, and none of it could leave the app with the plan. A surveyor filing a plan, or answering a question about one later, had nothing to file beside it.

## Decision

**One more file on the Export step: "Checks and sources report", a PDF made from one version's records.**

- **What it says, in order:**
  1. the version, when it was saved, when the report was made (its checks, engine and exports are as they stand then), and whether it is approved (with the approved content's SHA-256), or a draft, saying why an earlier approval no longer applies;
  2. the coordinate system and who confirmed it;
  3. the engine version that gave the report's checks and figures (the draft's own engine version isn't recorded with a document, so it isn't named);
  4. each source file with its format, points, size, import time and SHA-256, and what was worked out from it;
  5. who filled what: items drawn by tested code from the field codes and items AI suggested, with how many the surveyor confirmed, and plainly what AI does (it reads documents, sketches and the surveyor's words, and suggests text and which points make a lot, road or line) and what tested code does (reduces observations, works out distances, bearings and areas);
  6. the sketch read, if any: who read it, when, and how many readings agree with the survey, are within the usual measuring difference, differ, name a point the survey doesn't have, or couldn't be checked;
  7. every check, grouped most serious first (must fix, professional judgement, warnings, information), each with its detail, next step, what it holds back and its code;
  8. the version history and the files exported, with their SHA-256. The project's page reads the newest 100 versions and 50 exports; when a list reaches that, the report says older ones weren't read rather than count them.
- **It certifies nothing, and says so** on the first page and at the end: the licensed surveyor certifies a plan by signing the printed sheet.
- **Nothing is worked out for the report alone.** It reads what the project records, and the plan's own checks as the screen shows them. Sketch readings are checked against the points only on a confirmed coordinate system, as the plan's checks are. An import record that doesn't match the expected shape is left out, never guessed at.
- **It is held back only for a version that can't be read.** The plan PDF and DXF wait for blocking checks; the report is how those checks leave the app, so it is made for any readable version. A version whose saved settings can't be read shows defaults on screen, and a report of those defaults would describe a plan that isn't there, so it is refused with the reason.
- **It is recorded like every export:** kind `pdf`, `options: { content: "report", paper: "A4", orientation: "portrait" }`, with its SHA-256, in the project's history. The PDF is dated when it was made. The history names each kind of file in words ("Plan (PDF)", "Checks and sources report (PDF)").
- **Layout:** A4 portrait, Geist for words and Geist Mono for fingerprints and codes, every line wrapped inside the margins, a word too long for a line cut by whole characters with the ellipsis measured, and each page footed with the project (cut to fit), the version and "page n of N".
- **The Export step's links name the version shown,** so every file, the report included, is of the version the page says.
- **It is drawn by the same scene and PDF writer as the plan.**

## Consequences

- A plan can be filed with its sources, checks and fingerprints, and anyone can match a file to its SHA-256 later.
- The brief's §15 validation report and §16 provenance can leave the app. What isn't recorded can't be in it: documents and DXF files aren't kept (ADR 0240), so they don't appear.
