# ADR 0307: Ask for the sketch's read on the photo, and group what the surveyor confirms

- **Status:** accepted (stage 301, 2026-11-28)
- **Changes:** ADR 0234 (where the surveyor agrees to a sketch being read), ADR 0235 (how the plan's list is shown), ADR 0304 and ADR 0305 (which lines a habit can be said for).

## Context

Walking the live product as a surveyor (stage 301) showed three things the tests never did. A sketch photo is read only when a box far below it is ticked, and Generate Plan quietly goes on without it. The plan's list was 47 cards in one run, the questions lost among walls with nothing against them. The surveyor's house walls came back hatched, and habits covered only double lines and lines with x marks.

## Decision

- **The read is asked for where the photo is.** Each photo's card offers "Read it with Claude", with one line saying the photo goes to Anthropic, outside Sri Lanka. It sets the same agreement as the box below, which keeps the full statement. Nothing is read without one of these presses.
- **The choice is remembered in the browser for that person in that workspace** (`fb_sketch_read:<workspace>:<person>`), set only by their press and cleared by unticking: on a shared office computer one surveyor's choice is never another's. The card's line says the photos go to Anthropic and are kept with the plan; the box below says it in full. The box shows it ticked, so it's seen and can be taken back before every Generate.
- **The list is grouped, not shortened.** Questions come first as cards. Two or more alike fold under one line each, so a fold never vanishes as its items are confirmed: more lines read from the sketch to look over (open lines with no question, number to correct or habit of their own; each card still says what it rests on and any doubt; a building stays a card), measurements that differ, and what the second reading doesn't find. Each item keeps its own card and press, and the count above still counts every one.
- **Hatched lines take a habit,** offered as a building's wall or a wall. A surveyor has at most three habits, one for each way of drawing.

## Consequences

- A sketch added is a sketch read, unless the surveyor says no.
- The list reads as a few questions and a few folded groups.
- The lot and house this sketch gave are still wrong; the second reading's own corrections are the next step (stage 301 notes).
