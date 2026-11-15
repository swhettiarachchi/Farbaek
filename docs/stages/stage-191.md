# Stage 191: Survey Studio drafts the whole plan, the surveyor checks it

- **Branch:** `feat/survey-autodraft`, from `feat/survey-studio` (merged to `main` as #250).
- **ADRs:** 0202 (the AI drafts from the surveyor's words; the engine computes), 0203 (several lots and the classic Sri Lankan sheet), 0204 (lines from field codes are suggested, never applied).
- **Migration:** v94, `supabase/migrations/20270104090000_survey_autodraft.sql`: the two drafting operations in the usage ledger, and `app_survey_record_ai_draft`. The owner applies it before the merge (see the end of this page).
- **Docs:** `docs/survey/REFERENCE_PLANS_ANALYSIS.md`, `AI_DRAFTING.md` and `CAD_PRODUCT_STUDY.md` (new); `DATA_MODEL.md`, `PLAN_SHEET_SPECIFICATION.md`, `STANDARDS_RESEARCH.md` (S18, S20 to S24), `DEVELOPMENT_ROADMAP.md`; `docs/billing/usage.md`; `docs/architecture/current-state.md`.
- **Skills:**
  - **`farbaek-survey-studio`:** its rules throughout. Tested code calculates, never AI; nothing invented; points never move; Sri Lankan practice recorded with its source and status; a draft until the surveyor approves it. The reference plans were used for structure only (rules 2 and 14).
  - **`deep-research`:** the AutoCAD and ZWCAD study, in `reports/AutoCAD and ZWCAD for survey plans.md` and `research_notes/`, distilled into `CAD_PRODUCT_STUDY.md`.
  - **`claude-api`:** typed output with `betaZodOutputFormat`, adaptive thinking, image input, stop reasons.
  - **`farbaek-ui`, `farbaek-human-made`, `ui-ux-pro-max`, `premium-app-ui`:** StatusBadge kinds, pen nib and camera icons (no sparkles), plain words, 44 px targets, labels that name their inputs, no sideways scroll at 375 px.
  - **`chrome-browser`:** the PDF in Chrome's viewer.

## What the owner asked

The owner shared six plans by their father, a licensed surveyor in Gampaha District, and asked for a full study of the AutoCAD and ZWCAD sites. The goal: Survey Studio should produce a complete professional survey plan automatically, with the surveyor only reviewing, adjusting and approving.

Survey Studio's first rule is that AI never calculates. So "the AI drafts the plan" here means the AI reads the surveyor's own words, or an old plan's photo, into structure. The tested engine then computes and draws everything, and the surveyor checks every AI-filled item before the plan can be approved.

## Done

- **The reference plans, structure only** (`REFERENCE_PLANS_ANALYSIS.md`): where each element sits as a share of the frame, the lettering hierarchy, drawing conventions, the legend vocabulary, the title sentence's grammar for each kind of survey, and the formats. No name, plan number, place or measurement from them entered the repository.
- **Several lots per plan** (document schema 2, ADR 0203):
  - lots with raised labels and notes;
  - roads from two surveyed edges, their width computed square across and written in feet;
  - adjoining lands stored by their leg's two corners, with arrows;
  - notes, a code library, a structured title, and provenance for AI-filled items.
  - Schema 1 documents upgrade when read.
  - Lot topology: shared legs, T-junctions, overlaps, gaps, separate pieces, the entire land's outline, and corner numbers closer than 1 cm.
- **The classic Sri Lankan sheet**, now the default:
  - portrait with slanted lettering;
  - surveyor block, plan number, needle north arrow;
  - the Reference of codes the plan uses;
  - the composed title sentence, district and province;
  - bounded as follows, the extent in hectares and A-R-P, dates, statement and signature;
  - the boundaries schedule overleaf, in the same extent wording.
  - Paper and scale are picked automatically. Labels are placed clear of each other and inside their lot; side labels run along their leg; text past the border stops the export. The panel layout stays available.
- **Field-to-finish** (ADR 0204): lines and outlines suggested from point codes on the Lots step, each accepted by the surveyor.
- **The drafting assistant** (ADR 0202, `AI_DRAFTING.md`):
  - **Describe the job:** Claude reads the surveyor's description into lots, roads, adjoining lands, title fields and notes.
  - **Read an old plan:** one to three photos, shrunk in the browser and not stored, read into the title only.
  - **Checking:** `acceptDraft` keeps an item only if its quote is in the description word for word, its values are phrases of the quote, and its points are the quote's own, in order. Its points must exist and its lot must close.
  - **Review:** "Check the draft" shows every item with Looks right and Take out, beside the composed sheet. Nothing is saved until the surveyor saves it. Unchecked items block approval.
  - **Usage:** metered as `survey_draft` and `survey_read`, and refunded on failure or when a draft wouldn't save.
- **Compare two versions** on the History step, in words: lots and their corners, roads, adjoining lands, lines, title, sheet, codes, notes, and AI items that arrived, were checked or need checking again.
- **The pages:** a Draft step after Points. The Plan step's AI-filled fields get Looks right, with one mark per value. "Report this result" works for Survey projects. `/survey` and the home section show the portrait sheet at a sensible size with the drawing enlarged beside it.

## Reviews and what they changed

Two fresh agents reviewed the code with only the code and the rules, no conclusions: one the engine and sheet, one the drafting assistant. They found 29 problems and confirmed most of them by running the real code. All are fixed, with tests.

**Drafting.** Words the surveyor never wrote could get through:
- quotes matched inside longer words ("1234" in "12345");
- a lot's raised part and note weren't checked, so a note could carry a width;
- corners could be skipped or reordered;
- values could be gathered from scattered words ("Land of K. Sample");
- "BM-1" counted as point 1;
- any quote set the kind of survey;
- photo notes were taken.

Every one is now refused and tested. Other fixes:
- **Paid drafts that couldn't save:** drafts with over-long boundaries passed the checks but failed to save, after being paid for. Limits now match the document, and the whole draft is checked before it's charged.
- **Schema limits:** one long quote failed a whole draft. The limits now apply per item.
- **Review marks:** one mark covered five earlier-plan fields and every note. Each value now has its own.
- **Stale review state:** taking items out left stale review rows and lost older marks. The review is now rebuilt from a pure function.
- **Leftover marks:** marks for removed items blocked approval for good. They no longer count, and saving drops them.
- **Old labels on new lots:** drafted items reused old ids, so old labels landed on new lots. Drafted items now get fresh ids.
- **Dates:** dates that weren't whole dates are now asked about.
- **Compare:** missed duplicate labels and items needing a second check. It now matches by id, then name.

**Engine.**
- **Duplicated lot:** a lot entered twice doubled the extent with no warning. It's now an overlap.
- **Pinched gap:** a gap touching the outline at one corner could pass, depending on lot order. Rings are now split at repeated corners.
- **Label in the wrong lot:** a narrow access strip's label could land in the neighbouring lot. Labels are now placed at points across the whole lot and never outside it.
- **Adjoining legs:** adjoining lands moved to another leg when corners were edited. They're now stored by corners, and a missing leg stops the export.
- **Off the paper:** labels could run off the paper unnoticed, and the Sample's own west label crossed the frame. Now there are bounds, placement along the leg, and an off-sheet check.
- **Schema 1 upgrade:**
  - it invented a lot label "1";
  - long lot names failed to save;
  - the unchecked legend lost its approval hold;
  - a label nudge was lost.
- **Lots editor:** it dropped short roads and saved "Lot ?" silently.
- **DXF:** labelled shared legs twice.
- **Near-duplicates:** corner numbers a few millimetres apart weren't noticed.
- **Tests:** they didn't assert gaps or T-junctions.

**The same reviewers re-checked the fixes.** 19 of the 29 held as they were. The rest were tightened:
- a lot's corners could still come from another lot's list in the same quote, or miss the first or last corner, and a lot could be named from any word. Corners now come only from the list after "lot B1" in the quote, all of them;
- a description could be cut short ("land of A. Perera" from "A. Perera's heirs"). Descriptions must now end where the surveyor's clause ends;
- "not my plan" and "resurvey and sub division" were misread;
- the Plan step's "Filed of record in" used an old mark key, so a drafted value could hold approval with nothing to clear it;
- a draft with only adjoining lands replaced the plan's own without saying so;
- a crash in the checks left usage reserved;
- labels could cover the north arrow, or the Reference and title unreported;
- a lot's label could straddle a notch;
- DXF leg labels overlapped at T-junctions;
- the schema 1 upgrade dropped a surveyor's own legend meanings (my regression);
- plans saved during the stage with a leg number couldn't be read.

All fixed, with tests.

**My own checks** found:
- a road label reading "Road Sample Road";
- the overleaf's extents written differently from the face;
- vertical labels reading top to bottom (plans read up the page);
- the hero sheet 1,640 px tall on /survey.

All fixed.

## Known gaps, honestly

- **No real model call yet.** The drafting assistant hasn't made a real model call: there's no Claude key on the development PC, and Claude never handles API keys. The prompts and the typed output are tested with a labelled fake model. The first real call happens on production after the merge (see "Next").
- **Engine version 2.0.0.** Plans approved under 1.0.0 show "Approval no longer applies" until a new version is saved and approved. That's deliberate: the engine that draws them changed.
- **Phone memory:** photos are decoded at full size before shrinking, which uses memory on older phones.
- **Captions and fonts:** captions aren't editable per surveyor yet, and Sinhala and Tamil text are still refused on the sheet.
- **Not built yet (from the CAD study):** a plot stamp, a lot schedule CSV, near-miss "keep as surveyed" answers, a plan-standard profile, dictation and the coloured geometry compare (roadmap).

## Verified

- **Unit and fake-model tests:** `src/core/survey`, `src/server/survey`, `src/components/survey`: 113 tests. They include known answers (the Sample's lot areas exact by BigInt, a road width of 4.418 to 4.568 m written "(14.5ft - 15ft wide)"), every drafting bypass both review rounds found, the pinched gap in four lot orders, a duplicated lot, the narrow strip at 1:500 and 1:1000, and a DXF read back by `dxf-parser`.
- **Database (PGlite):** `tests/db/survey-studio.test.ts` passes, including v94: the ledger lists exactly the app's operations, and the audit function's validation, roles and grants.
- **Design tests, `pnpm typecheck`, `pnpm lint`:** pass. The full suite, 3,267 tests, passed before the review fixes.
- **The PDF in two readers:** Chrome's viewer shows the classic face and the overleaf schedule. Xpdf's `pdftotext` reads every bearing, area, the extent, the grid note and the schedule.
- **The demo build in the browser:**
  - the Draft step at 375 px, with both buttons off and the reason shown;
  - the review screen with a synthetic draft (a temporary local page, removed): Looks right, Take out, no sideways scroll, 44 px targets;
  - /survey and the home section at 1280 px.

## Next

1. **The owner applies migration v94** before merging (the command and its hash are in the PR).
2. **After the merge:** check `/api/health` shows the merge's build. Then, on a project with synthetic points, try one description and one photo of the public Sample PDF, and check what comes back against `AI_DRAFTING.md`.
3. **Then:** subdivision proposals, per `DEVELOPMENT_ROADMAP.md`, and the CAD study's near-term items: a plot stamp, a lot schedule CSV, and "keep as surveyed".
