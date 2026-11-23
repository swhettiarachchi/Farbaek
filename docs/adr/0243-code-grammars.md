# ADR 0243: The words after a field code are a grammar kept as data, with a code report before drawing

- **Status:** accepted (stage 234, AutoSurvey part 7, 2026-11-23)
- **Builds on:**
  - ADR 0204 (field-to-finish);
  - ADR 0237 (office code libraries, Carlson-style `.fcl`);
  - the owner's AutoSurvey brief §10 (code libraries, line control codes, curves, closures);
  - the research report "Survey Field to Finish automation", whose first recommendation is the code grammar as data, with presets per dialect and a code report before drawing.
- **Changes:** how line words are read, and the plan's checks. A plan document gets a `grammar` field, left out of the approval fingerprint while it is Farbaek's own, so earlier approvals stand. No migration.

## Context

Field-to-finish read two words, END and CLO, fixed in its code, and a line stopped at the first point with another code. Crews trained on Carlson write BEG and END and run a line through other shots until it's ended. They join to an earlier point with JPN, and mark arcs with PC and PT. Their files came out as broken lines, or no lines at all.

Codes the library didn't know were only reported at lot corners. Elsewhere they disappeared silently. The research found these two things to be the documented time sinks: a library that doesn't match what crews typed, and missing begins and ends.

## Decision

**A grammar is data** (`src/core/survey/grammar.ts`): its begin, end, close, join and arc words, and whether a line runs through other codes.
- **Farbaek** (the default, and how every plan read before): END and CLO; a line stops at the next other code.
- **Carlson**, from Carlson's published help:
  - BEG and END, CLO, `JPN n` (a segment from the point to point n), and PC/PT;
  - a line runs through other codes until it's ended.
  - SurvPC's ST and EL aren't taken, since ST would read a Sri Lankan crew's St (stake) as a begin.
- **Civil 3D and Trimble** let each firm define its words and publish no default spellings, so they have no preset.

**What reading never does:**
- Under Carlson's words, a word that is a code of the library, written exactly, stays a code even where the grammar would read it as a word (an office's PC power cable stays PC). In a description, only words in capitals count ("gate pt" isn't PT).
- Farbaek's reading doesn't change at all: END and CLO always count, and when both are written the last one does, as before. The review's 20,000-case comparison with the earlier code found one difference ("CLO END"), now fixed and tested.
- Arcs are read and reported, then drawn as straight segments between their surveyed points, since curves aren't drawn yet.
- A join to a point that isn't in the survey isn't drawn, and is said. So is a join with no line code to draw with, one with no point number, and a point joined to itself.
- A line code hidden in a description ("CP MW gate") isn't taken, and is said.

**Choosing the grammar:**
- It is set on the Codes step ("How your crew writes line words"), with a sentence saying what each reads.
- A Carlson code library (`.fcl`) uploaded at AutoSurvey's start brings Carlson's words, and the start screen says so.
- A returning surveyor's next plan takes the words from their newest plan whose codes they checked (ADR 0237's defaults), when they aren't Farbaek's own, and the start screen says which plan they came from.
- Changing it asks for the code list to be checked again, like any change to the list.
- The automatic draft, the lines editor and the import preview all read with the plan's grammar.

**The code report**, in the plan's checks, for information:
- **`CODES_NOT_IN_LIBRARY`:** every code the points carry that the library doesn't know, with its count. Corner codes keep their own finding, so they aren't listed twice.
- **`CODE_LINES_TO_CHECK`:** what reading the line words found:
  - a line of one point (unless the plan already draws a line of that code through it);
  - a join to a missing point;
  - an arc drawn straight;
  - an arc with no start or end.

## What it doesn't do

- **Curves aren't drawn** (PC/PT, Civil 3D's three-point arcs, Trimble's tangential arcs).
- **No offsets, rectangles or right-angle jogs** (Carlson's OH/OV, RECT, JOG): they would compute positions no one surveyed, which needs its own decision.
- **No custom word lists yet.** A firm whose words match neither preset can't enter its own.

## Consequences

- A Carlson-trained crew's file draws its lines as they meant them, and the surveyor sees in the checks what couldn't be read.
- A plan read with Farbaek's words is unchanged, line for line, and its approval stands.
