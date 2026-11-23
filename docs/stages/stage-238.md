# Stage 238: AutoSurvey, suggestions for codes the library doesn't know

- **Date:** 2026-11-23
- **Branch:** `feat/stage-238-code-hints`, from `feat/stage-237-metrics`
- **Decision:** ADR 0246
- **Migration:** none. **New dependency:** none.
- **Skills used:**
  - `farbaek-survey-studio`: points keep their codes as recorded; tested rules suggest, the surveyor chooses;
  - `farbaek-ui` and `farbaek-human-made`: pill buttons named by what they add, reasons in plain words, checked at 375 px.

## What the owner asked

The AutoSurvey brief's §10 asks that field-to-finish handle unknown codes with the surveyor's confirmation, and its research named unknown codes as one of the places surveyors lose time.

## What was built

- **`src/core/survey/codehints.ts`:**
  - `unknownCodes`: the codes on the points the library doesn't know, with counts, numbered strings merged (never into a road edge's letters), road edges with a side left out, and a bare road edge or a line word marked as one that can't simply be added;
  - `codeHints`: up to three suggestions (the same code in another list, a meaning that holds the word, one letter away);
  - `adoptCode`: the entry a press adds.
- **The Codes tab** (`plan-panels.tsx`): each unknown code with how many points carry it, its suggestions grouped under their reason, and "Something else" for a blank entry. A press adds it to the library and undoes the list's check. A road edge with no side, or a line word written alone, is explained instead, with no press.
- **`CODES_NOT_IN_LIBRARY`** no longer lists road edges with a side, and its next step points to the Codes tab's suggestions.

## Verified

- **`codehints.test.ts`, 13 tests:** unknown codes counted and merged, road edges left out, a road edge's letters never offered, line words marked; the Survey Department's code first, both meanings when the lists disagree, meaning words with the project's own and the thing named first, never two suggestions that add the same entry, one letter apart only for three letters or more, nothing for a known, blank or too-long code; what a press adds.
- **`grammar.test.ts`:** the finding leaves road edges out.
- **In a browser, on the demo build at 375 px,** with two sample points recoded for the look only (then restored): WALL offers Masonry Wall, Retaining Wall and Mark on Wall under "Its meaning has "WALL" in it"; WoP offers Wooden Fence Post from the Survey Department's list and Concrete Fence Post one letter away; buttons are 40 px pills, off in the read-only demo; no sideways scroll.
- Survey, app, component and design tests: 877 pass. `pnpm typecheck`, lint on the changed files and `pnpm build` pass.

## Review

A fresh review agent reproduced three faults and two smaller ones, all fixed and tested:

1. **A numbered code whose letters are a road edge's (RD3) was offered as "RD",** and adding RD would have made the library read RD1 and RD2 as that code, taking the road's points as boundary marks. Numbered strings are no longer merged into a road edge's letters, and a bare RD is explained, not offered.
2. **Two suggestions could add exactly the same entry** (two "Earth Drain"s for DRAIN). Suggestions are now told apart by what they'd add.
3. **A line word written alone (END, PC) was offered as a code,** and under Carlson, where codes win over words, adding it would have stopped every END ending its wall. It's now explained, with no press.
4. **Smaller:** a reason could repeat as a React key (groups are now kept by reason), and code length was counted two ways (now as the schema counts it, and a code is never cut).

From its notes: a meaning that ends with the word now comes before one that only mentions it (FENCE offers Live Fence before Fence Post), and a road edge with no side is still named by the finding, since it keeps the road from being drawn.

## Not done, and why

- **Not pressed in a browser:** the demo workspace is read-only. What a press adds is tested in `adoptCode`. The road-edge and line-word sentences added after the review weren't looked at in a browser; they are plain text in the same layout.
- **"Something else" adds a mark** described as "Describe it", like Add a code: until described, a fresh draw from the points would count it as a boundary mark.
- **A firm's own word list** (synonyms beyond the meanings in the lists) isn't built.
