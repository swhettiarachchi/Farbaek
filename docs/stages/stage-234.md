# Stage 234: AutoSurvey, part 7 continued: line words as a grammar, and a code report

- **Date:** 2026-11-23
- **Branch:** `feat/stage-234-grammar`, from `feat/stage-233-labels` (PR #296)
- **Decision:** ADR 0243
- **Migration:** none. The plan document gets a `grammar` field, left out of the approval fingerprint while it's Farbaek's own.
- **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`: the cadastral drafting guide (surveyed versus inferred) and rule 2 (never invent survey facts), which is why there are no offsets or rectangles;
  - the research report's study of Civil 3D, Carlson and Trimble field-to-finish.

## What was built

- **`src/core/survey/grammar.ts`:** the Farbaek and Carlson grammars as data, and the rule that a `.fcl` library brings Carlson's words.
- **`src/core/survey/fieldToFinish.ts`:**
  - lines are read with a grammar: begin, end, close, join to a point, arcs read and reported, and lines that run through other codes;
  - `codeReport` gives every code's count and what it is, the lines made, and what reading found.
- **The plan's checks** say:
  - which codes the library doesn't know (`CODES_NOT_IN_LIBRARY`);
  - what reading the line words found (`CODE_LINES_TO_CHECK`), both for information.
- **The Codes step** asks how the crew writes line words, with a sentence for each choice.
- **AutoSurvey's start** reads a Carlson library's line words the Carlson way and says so. A returning surveyor's next plan takes the words from their newest plan whose codes they checked, and the start screen names that plan.
- **Every reader uses the plan's grammar:** the automatic draft, the lines editor and the import preview.

## Verified

- **`grammar.test.ts`, 11 tests:**
  - Carlson's words read, ignoring case, with ST and EL not taken;
  - a line running through other codes until END, where Farbaek's stops;
  - BEG starting a fresh line, CLO closing, numbered strings kept apart;
  - JPN joining, and a missing point said;
  - PC/PT read and drawn straight, and said;
  - a library code that is also a grammar word staying a code, and a stake never read as a begin;
  - Farbaek's reading unchanged;
  - the `.fcl` rule;
  - the code report's counts, unknown codes and findings;
  - the checks' two findings, with no repeat of corner codes and none for a wall the plan already draws;
  - the approval fingerprint unchanged for Farbaek's grammar and changed for Carlson's.
- **Generate Plan with a Carlson library** sets the plan's grammar (`generate.test.ts`).
- **The survey, app, component and design tests (806) pass,** and the earlier approval-fingerprint test still matches documents saved before the field existed.

## What a fresh review found, and what was fixed

A review agent confirmed 7 faults, each with a temporary test. It also ran a 20,000-case comparison of Farbaek's reading against the code before this stage; that comparison found only fault 7. All are fixed, with tests (`grammar.test.ts`, now 17).

1. **A library code with a number in it (BM1) was reported as unknown.** Codes are now matched as the library does, as written and then by their letters, and shown as the library names them.
2. **A corner code with a number (XY1) was listed twice,** once by the corner finding and once by the code report. Both now compare the same key.
3. **A point whose only drawing is a join** was said to be "not drawn". It isn't said any more.
4. **An open arc outlived its line,** so an arc could span two separate lines. An arc now ends with its line, and an arc replaced by a second one is said.
5. **A join with no line code to draw with, or no point number,** was dropped without a word. Both are now said.
6. **A point joined to itself** was said to join a point "not in the survey". It now has its own sentence.
7. **Farbaek's reading had changed in two corners.** "CLO END" closed where the last word used to count, and a library code spelled END beat the word. Farbaek's reading is now exactly as before. Carlson's keeps library codes over words, and in a description reads only words in capitals.

From the smaller findings:
- a code written twice on a point counts once;
- "gate pt 23" in a Carlson description is no longer an arc end;
- a line code hidden in a description ("CP MW gate") is said instead of silently lost;
- the code list panel's doc comment is back above it.

**Still as it is:** the import preview can't join to points already in the project, so a JPN to one of them shows as missing in the preview. The draft, which reads every point, joins it.

## Not done, and why

- **Curves:** PC/PT are drawn as straight segments, and say so.
- **Offsets, rectangles and jogs:** they would place points nobody surveyed.
- **A firm's own word list,** for Civil 3D or Trimble crews.
- **Not looked at in a browser:** the Codes step's choice is a plain select beside the list it applies to.
