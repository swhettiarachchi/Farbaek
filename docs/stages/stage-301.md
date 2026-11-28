# Stage 301: what a surveyor tripped on, walking the live product

The owner asked for Survey Studio to be used as a surveyor would, then fixed from what that shows ("always use like this feature like a surveyor"). Decision: ADR 0307.

## The walk (production, build 315bcc883956, test project "Test: surveyor walk after stage 300")

The owner's real job, as the surveyor would bring it: the instrument file (40 points, no codes) and the photo of his field sketch.

1. **New survey:** the files were sorted at once (the instrument file read, the photo taken for a sketch). The photo showed "Not read": Claude reads a sketch only once a box far down the page, inside a privacy paragraph, is ticked, and Generate Plan works without it, leaving the sketch unread. With no codes, nothing is then drawn. This is the likeliest reason the surveyor's own plan opened with nothing drawn.
2. **Generate Plan, with the box ticked:** about three and a half minutes showing only "Reading your sketches…"; then the plan opened on the Plan step (stage 300's fix held).
3. **The plan:** "Only these 47 need you": one must-fix (the lot's label), then 46 cards in one long run. About 18 were walls written MW with nothing against them, each with its own Confirm; four measurements that differ; seven items the second reading doesn't find; the questions a surveyor must answer were lost among them.
4. **Against the printed plan:** the lot came out 168.26 m² against the printed 132.53 m² (it takes 23 for 22 on the right side; the second reading itself says the side runs 5 to 22); the house came out as two buildings, neither the printed one. The surveyor's house walls were read as hatched lines this time, and a habit could only be said for double lines and lines with x marks.

## What was done

- **The sketch read is asked for on the photo:** each photo's card has "Read it with Claude", with one line saying the photo goes to Anthropic, outside Sri Lanka; the full statement and the box stay below. The choice is the person's own and is remembered in this browser, so the next survey reads the sketch without hunting for the box.
- **The list a surveyor works through:** questions first, as cards; two or more alike folded under one line each: more lines read from the sketch to look over, measurements that differ, items the second reading doesn't find. Every item keeps its own card and press (`groupConfirm`).
- **Hatched lines take a habit:** a building's wall or a wall, like double lines and lines with x marks (`HABIT_STYLES`).

## Review

A fresh review found one real fault and smaller ones, all fixed:

- The fold said the lines in it had "nothing against them", but a line read once with doubt, or with a point off it, can be among them; it now says "more lines read from your sketch, to look over", and each card says its doubt.
- The remembered choice was for the whole browser: it is now for that person in that workspace only.
- The photo card's button agrees to reading every photo: it says so when there are several, and that they are kept with the plan.
- A fold of three went back to cards at two, moving the surveyor's place: folds now start at two.

## Verified

- `group-confirm.test.ts`, `habits.test.ts` (hatched habits). `tsc` and `eslint` clean.

## Not done, for next

- The lot and the house: use what the second reading says (5 to 22, not 23) to correct the drawing, not only to ask.
- The wait: say what the three and a half minutes are spent on.
- One measurement read twice (1.63 and 1.65 between 19 and 18) is two cards.
- A line the second reading agrees with could count as read twice; on this sketch most numbers are read with doubt, which keeps them unsettled anyway.
