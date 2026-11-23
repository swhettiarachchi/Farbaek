# Stage 226: AutoSurvey, part 3: a returning surveyor sets nothing twice

- **Date:** 2026-11-23
- **Branch:** `feat/stage-226-defaults`, from `feat/stage-225-observations` (PR #289)
- **Decision:** ADR 0237
- **Migration:** none. **New dependency:** none.
- **Skills used:** `farbaek-survey-studio`:
  - rule 2: never carry survey facts;
  - rule 6: provenance on what's carried;
  - the code library model.

## What was built

- **`src/core/survey/codelib.ts`:** recognises a firm's code library (`.fcl`, or a CSV with Code and Description, Layer or Linework columns and no coordinates). It reads each code as the firm wrote it, and takes the codes the files use first when the library is over the plan's 80.
- **`src/core/survey/autosurvey/defaults.ts`:**
  - the newest code list the surveyor checked themselves, still checked;
  - their latest plan's sheet presentation, without its scale;
  - never anything about the land.
- **`src/server/survey/defaults.ts`:** reads those from the surveyor's five most recent plans through row-level security; a failed read gives no defaults.
- **Generate Plan:**
  - starts the plan from those defaults;
  - takes an office library uploaded with the files, read again on the server, over the carried list, for one check;
  - swaps in the Survey Department's list only over the common one.
- **The start screen:**
  - lists an uploaded library ("Office code library, 3 codes. It becomes this plan's code list, for you to check once.");
  - says what carries over;
  - refuses two libraries at once, or one that can't be read, with the reason.

## What a fresh review found, and what changed

1. **A points file was taken for a code library** when its coordinate columns carried units or underscores ("Easting (m)", "NORTHING_M"), so its points were never imported (high). Now the points reader's own header reading decides: any coordinate column means it isn't a library.
2. **An older office list was carried over a newer decision** to use the common list. Now the newest checked list decides.
3. **The check mark wasn't reliable:** it records no reviewer, a colleague's project counted, and editing a checked list kept it checked. Now a carried list waits for one press, only the surveyor's own projects count, and an edit undoes the check.
4. **Codes left out of a large library weren't said.** The start screen now says how many.
5. **The used codes were matched wrongly** ("MW2 wall corner"). They are now read the way the plan reads a point's code.
6. **Codes were cut to 12 characters and repeats judged loosely.** Long codes are refused by name, and only exact repeats are repeats.
7. **A quoted line break made a junk code.** Records are now split only outside quotes.
8. **Gaps in the tests:** the Survey Department list never replacing an office library is now tested, with the plan as created.
9. **The request could pass the 6 MB limit.** The library counts toward the 5 MB of data, it is capped at 500 KB, and a refused request is said.

## Verified

- **Tests:**
  - 6 on code libraries, including every coordinate header the points reader accepts, quoted line breaks, long codes, exact repeats and the summary:
    - recognising one and not a points file;
    - reading kinds, styles and meanings, with a repeated code dropped;
    - fallbacks and refusals;
    - the 80-code limit taking the used codes first.
  - 2 on defaults:
    - the checked list carried, waiting for one check;
    - the newest decision winning;
    - presentation carried without the scale or the land;
    - no list that wasn't checked or is still a default;
    - nothing for a first plan.
  - 4 on Generate Plan, run as the server runs it:
    - carried defaults applied;
    - an office library winning and waiting for its check;
    - an unreadable library stopping it before anything is saved;
    - the Survey Department's list swapped in over the common list but never over an office library.
- **In a browser,** on the demo: a points file and an `.fcl` uploaded together. The library is listed as read with its count, and the settings card names it. No sideways scroll.

## Not done, and why

- **No separate profile page or table** (equipment, export formats, title-block preferences): it needs a migration, and the owner applies migrations.
- **Carlson's control codes** (BEG/END, PC/PT, CLO, JPN, offsets) aren't read yet.
