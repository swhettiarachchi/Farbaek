# ADR 0305: A line with x marks can be a building's wall

- **Status:** accepted (stage 299, 2026-11-28)
- **Changes:** ADR 0304, where a habit for a line with x marks could only name a fence.

## Context

The owner's father hatches a house's walls with x marks. On the real job, the reader reads those lines as "crossed", and Farbaek takes crossed lines for wire fences, so his house walls were asked about as fences, and the habit card offered only Live Fence (LF) and Net Fence (NF). Pressing a fence there would have made every x-marked line a fence. The owner said yes to letting a line with x marks also mean a house wall.

## Decision

- **A new kind of line, a building's wall** (`building` in `LINE_KINDS`): a line whose code is a building's outline code, such as P (Permanent Building). It's on the buildings layer and drawn as an open line like a line of unknown kind, never as a closed outline: a building is still made only from its label and the lines round it (stage 254). A Toilet (T) is an outline but not a building, and stays a line of unknown kind.
- **What x marks may be:** a habit for a line with x marks may name a fence or a building's wall from the plan's list. The card offers both, the building never crowded out by fences (the first of each kind is kept among the three). A double line is still only a wall.
- **Words:** the card offers "A wall of a permanent building (P)"; the plan says "a line with x marks is a wall of a permanent building (P)"; a line read that way is "Read as a building's wall", and its confirm card says "A permanent building wall read from the sketch".
- **Writing counts the same:** a line written "P" is also read as a building's wall, and along a labelled house it is one of the house's walls, never "something else" that stops the house. A meaning that says wall ("Building Wall") stays a wall. Saving the habit draws lines already on the plan as a fresh read would: open, round to their start.

## Consequences

- The father can say once that his x marks are a building's walls, and those lines stop being asked about as fences.
- Measured on the real job's stored read, with both habits: the question on line 9 to 8 goes, and it's read as a building's wall. 15 to 9 and 4 to 3 were already drawn as walls of the house round "ගෙදර". The list stays at 21, because the read doubts most of its numbers.
