# ADR 0264: Reading the sketch's Sinhala words, a building word given only as writing, and a new read replacing an unchecked one

- **Status:** accepted (stage 256, AutoSurvey, 2026-11-24)
- **Builds on:**
  - ADR 0249 (the sketch's drawing applied as items waiting for the surveyor);
  - ADR 0260 (two reads merged);
  - ADR 0262 (a house from the area its walls close round).
- **Changes:**
  - the sketch reader's instructions;
  - how the interpreter takes areas;
  - what "Read and replace" does.

  No migration, no new dependency.

## Context

The owner's real job was run through production twice more after stage 254 went live. Claude's reading of the same photo varied between runs:

- one run read the Sinhala word for home (ගෙදර) and the gate (ගේට්ටුව), and Farbaek drew the house;
- the next listed both as "Sinhala writing… unreadable", so no house was drawn, and it read an extra wall that took the lot to the wrong corner.

Reading the sketch again with "Read and replace" then left the first read's unconfirmed lot and lines on the plan beside the new read's, so the right lot from the second read never replaced the wrong one.

## Decision

- **The reader is told the Sinhala words sketches use** (house, well, gate, road, lane, drain, fence, wall, post, tree, land, garden), to read them in Sinhala script however they're turned. A word it can read only in part is given with its best reading and its doubt, not left as unreadable. It's also told a house's word written inside the land is an area, even with only two or three numbered corners, and a feature reading at its place. As before, a doubtful reading is never taken as a fact on its own: a house is drawn only when ADR 0262's rules settle it.
- **A building's word given only as writing** (a feature or note reading with its place on the photo, and no area with that word) is taken as that area's label with no corners, once per word and photo. Its outline is then found as ADR 0262 finds it.
- **A new read replaces what the last read drew and nobody confirmed.** Lots, lines, roads and symbols that came from the sketch and are still waiting go before the new read is applied, with their moved labels. Anything the surveyor confirmed, changed or drew stays, and so does a lot they've named, noted or given neighbours, though they haven't yet pressed that it looks right.

## Verified

- **`stage256.test.ts`** (synthetic):
  - a building word given as writing becomes an area once, and never beside the reader's own area, without a place, or for writing that isn't a building;
  - a new read clears only what's waiting, keeps the surveyor's own items, and changes nothing on a plan confirmed throughout;
  - the reader's instructions carry the words.
- **The owner's real job, with production's earlier read:** unchanged, the house still drawn.

## Not done, and why

- **Reading the same photo more than twice** to settle what two reads disagree on: each read is a model call, and two are already merged.
- **Printing Sinhala on the sheet:** the sheet's fonts hold no Sinhala yet, so a road's Sinhala name is asked for in English letters, as before.
