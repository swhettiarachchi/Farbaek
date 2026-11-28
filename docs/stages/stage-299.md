# Stage 299: a line with x marks can be a building's wall

After stage 298 went live, the habit card on the owner's real job offered only fences for a line with x marks, while those lines are the father's hatched house walls. The owner said yes to adding house walls. Decision: ADR 0305.

## What was done

- `src/core/survey/sketchintel/classify.ts`: the kind `building` (a building's wall, on the buildings layer); `kindOfEntry` reads a building's outline code (P) as one; `HABIT_KINDS` (x marks: fence or building), `habitFits`, `habitChoices` keeps the first of each kind, `lineThing`, `HABIT_TAKES`.
- `interpret.ts`: "Read as a building's wall"; drawn open like a line of unknown kind; a written building line along a labelled house no longer stops the house.
- `report.ts`: reads lines with the plan's habits.
- `exceptions.ts`, `confirm-item.tsx`: each choice carries its words ("A wall of a permanent building (P)"); a line with a building's code is "A permanent building wall".
- `actions.ts`: the refusal says what the style may be ("a fence or a building's wall").

## Review

A fresh review found two real faults and two small ones, all fixed:

- Saving the habit on a closed hatched house already on the plan made it a closed building outline, unlike a fresh read. The save now draws it as a fresh read would: open, round to its start.
- A wall written P beside a labelled house was drawn twice, as the house's side and as its own line. Written building walls are now among the house's walls.
- The card called a line code such as "Building Line" a wall; only a building's outline code is, and a meaning with "wall" in it stays a wall ("Building Wall").

## Verified

- `habits.test.ts`, `sketch-habits.test.ts`: the card offers LF, NF and P for x marks, and P isn't crowded out by four fences; never P for a double line, never T; the Survey Department's list offers only fences. A line with x marks and the habit is a building's wall on the buildings layer, open, with no question; P written along a line reads the same. Saving takes P for x marks, and refuses it for a double line.
- The real job, locally, with both habits: the question on 9 to 8 is gone (read as a building's wall); 21 to confirm, 12 notes (13 before).

## Next

- Live check after merge on my test run (1f3e6060): the x marks card offers P; pressing it, then Forget it.
