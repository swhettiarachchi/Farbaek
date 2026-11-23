# ADR 0246: Codes the library doesn't know get suggestions, and one press adds them

- **Status:** accepted (stage 238, AutoSurvey, 2026-11-23)
- **Builds on:** ADR 0237 (the office code library), ADR 0243 (line words and the code report); the owner's AutoSurvey brief §10 (field-to-finish: unknown codes mapped with the surveyor's confirmation)
- **Changes:** the plan editor's Codes tab, and the wording of one finding. No migration, no new dependency.

## Context

Since stage 234 the plan's checks say which codes on the points the library doesn't know (`CODES_NOT_IN_LIBRARY`), and the surveyor adds each by hand on the Codes tab: Add a code, then type the code, its meaning, and how it's drawn. The research for AutoSurvey found unknown codes to be one of the documented time sinks of field-to-finish, and most of them are a code from another list, a word spelled out, or a slip of the keypad.

## Decision

**The Codes tab lists the codes on the points that the library doesn't know, each with up to three suggestions, and one press adds the code with the meaning chosen.**

- **Suggestions come from tested rules, strongest first, never a model:**
  1. the same code in the Survey Department's list or the common list, when the project's library doesn't have it (both are offered when the two lists disagree, as they do for MW);
  2. a code whose meaning holds the unknown code as a word, for codes of three letters or more ("WALL" and Masonry Wall), the project's own library first;
  3. a code one letter away (one added, dropped, changed, or two swapped), only when both have three letters or more: two-letter codes differ by one letter all the time (CP and EP).
- **A press adds the code as the points carry it,** with the suggestion's meaning, drawing and Reference setting, or a blank entry to describe ("Something else"). The points keep their codes exactly as recorded: nothing about a point changes.
- **Adding a code is an edit of the list,** so the list's check is undone, as for any edit (ADR 0237): the surveyor checks the list again before approval.
- **Numbered strings of one code** ("TREE1", "TREE2") are that code, as the library reads them, so they're offered once, unless their letters are a road edge's: RD3 stays RD3, since adding "RD" would make the library read RD1 and RD2 as that code.
- **Road edges with a side** (RD1, RD2, RDL, RDR) draw the road and are never library codes, so they're neither offered nor listed by the finding. **A road edge with no side** (RD, ROAD) keeps the road from being drawn: the finding names it, and the tab explains it with no press.
- **A line word written alone** (END, or PC under Carlson) ends or joins nothing; adding it to the library would make it a code on every point under a grammar where codes win over words. The tab explains it with no press.
- **Two suggestions that would add the same entry are one,** and a meaning that ends with the word ("Live Fence" for FENCE) comes before one that only mentions it ("Fence Post").
- **A code longer than 12 letters** can't go in the list; the tab says so instead of offering a press.
- The list is worked out only while the Codes tab is open.

## Consequences

- An unknown code is one press instead of three fields, and the surveyor still chooses what it means.
- A wrong suggestion costs nothing until pressed, and a pressed one is an ordinary list entry the surveyor can change or remove.
