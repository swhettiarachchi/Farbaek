# ADR 0306: The Draft step leads with one next step

- **Status:** accepted (stage 300, 2026-11-28)
- **Changes:** where Generate Plan opens a plan, where a project opens by default, and what the Draft step shows first.

## Context

The owner's father generated a plan on his own PC from a points file with no codes. The points alone draw nothing without codes, so Generate Plan chose the Draft step before the sketch was read, and the plan opened there even when the sketch then drew it. The Draft step led with three tools for drawing a plan by hand: "Draw the plan from the points", "Describe the job" and "Read an old plan". He typed "make it correctly" into the description; its button stayed grey, with no reason, because a description needs 20 characters. The owner: "backend should be advance but frontend should be simple and user friendly".

## Decision

- **A sketch that drew the plan opens it on the Plan step,** where its questions are: the start screen picks the Plan step after the read. In Express, Draft stays in the step list until there is a lot, so a plan drawn without one can go back to the sketch.
- **A project opens on the Plan step as soon as anything is drawn on it** (a symbol counts), not only once it has a lot.
- **The Draft step leads with one next step** (`DraftNext`), worked out from the plan, never by a model:
  - while the sketch is read, that it's being read;
  - when anything is drawn, what was drawn ("Farbaek drew the lot, 12 lines and the road from your field sketch" only when the sketch drew all of it, else "Your plan has…"), how much waits, and one button, Check the plan; without a lot, that it isn't drawn yet, and that a clearer photo or its corners on the Lots step closes it;
  - when nothing is drawn, to add a photo of the field sketch, saying why when the points carry no codes.
- **The sketch card comes next,** its words corrected: a sketch now draws the lot, walls and road through the surveyed points.
- **The ways to draw by hand are folded** into one "Other ways to draw the plan". They work as before.
- **No grey button without a reason:** "Draft the plan" says to write which points make each lot until the description is long enough. Its example is one short line marked "For example".
- **The start screen says so before Generate** when every point lacks a code and no sketch is added: the sketch is what draws the lot. It never blocks; a description works too.

## Consequences

- A codeless job with a sketch lands where the work is. Without a sketch, the first thing the surveyor sees is to add one.
- The expert tools are one press away, not in the way.
