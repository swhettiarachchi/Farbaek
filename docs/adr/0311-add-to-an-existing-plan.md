# ADR 0311: Add to an existing plan, updating only what the new information changes

- **Status:** accepted (stage 306, 2026-11-28)
- **Changes:** ADR 0209 (the automatic draft only onto a plan without lots), ADR 0258 (incremental regeneration decided, not built), ADR 0240 (a new read replaces the sketch record).

## Context

The owner's platform brief (`docs/survey/AUTOSURVEY_PLATFORM_BRIEF.md`) asks that a surveyor can come back to a project with more: more coordinates, another sketch, a deed, corrections. Farbaek should work out what changed, update only the parts it affects, keep the history, and leave the rest alone.

Before this stage, a drawn plan didn't do that:
- The Import step added points to it but drew nothing from them, since the automatic draft only draws onto a plan without lots.
- A new sketch read replaced the earlier one, losing what the earlier photos said.
- There was no one place to add things.

## Decision

- **One card, "Add to this plan", on the Plan step** (Express too). The surveyor chooses survey files, sketch photos and the deed together.
  - Each file is read at once against the plan's points: how many are new, how many it already has, and any point it gives somewhere else.
  - One press does the rest.
  - The Sample and a read-only workspace show what files would add, but can't save.
- **Survey files** are read again on the server with Generate Plan's readers.
  - **Refused first, nothing imported:** a file that can't be read, a point number given twice, points off the plan's grid, a grid changed since the page was shown, or a point the plan already has somewhere else. Each is said point by point: within half a millimetre is the same place, and a file without heights or codes says nothing about them.
  - **Then:**
    - Points the plan has are sent exactly as it has them, so the database keeps each once and changes none.
    - Each file is kept as its own source.
    - The plan is updated in one version.
- **Only what the new points change is redrawn** (`updateForNewPoints`):
  - **Lines from the field codes:**
    - A line the codes now draw differently is redrawn while it waits for the surveyor.
    - A line they confirmed, edited or took off is never drawn again, longer or not. One they confirmed is named.
  - **The lot and the road** drawn from the boundary marks and road edges:
    - Redrawn from the new marks while they wait and are unedited.
    - Drawn only when the marks first make one, never again after the surveyor took them off.
    - Left as they are, and named, when confirmed, or when a neighbour named beside a side would lose it.
  - **What the sketch draws** is worked out again with the new points. Only what that changes is redrawn, as a correction is (`redrawFromCorrection`).
  - **The survey date** a new file states fills an empty one.
- **Failure:**
  - **A file failing part way:** the plan is still updated for the files before it, and the surveyor is told which to add again.
  - **A save another press got in first:** the update is made again once, on the newest version.
- **A new sketch** is read together with the photos the plan keeps (`withStored`), so the earlier sketches aren't lost. Every photo is kept with the new read.
  - **Kept with the new read:** the surveyor's corrections of numbers and the strokes they joined on those photos, and their answers to joins.
  - **Refused when** any of the kept photos can't be loaded, rather than losing what it said.
  - **The limit** of six photos counts the kept ones, and is checked before any photo is sent.
- **The deed** is read into the title as before, on the version the update saved.
- **Afterwards,** what changed is said in plain sentences, with a link to the History step's comparison of the version before the update.

## Consequences

- **What a returning surveyor gets:** they add files and press once; the plan grows where the new points reach, and nothing they confirmed moves.
- **Undoing an update** as a whole isn't built yet: the next stage (307) brings back an earlier version in one press.
- **Not offered when adding:** a field book whose legs start on the plan's stations can't be read by this card yet, and the office profile's instrument precision isn't used for an adjustment made here. Both still work on the Import step.
- **Lines that grow:** under Farbaek's own line words, a line ends where another code comes between. So a second visit's wall point starts a new line rather than continuing the first. Under Carlson's words, lines run on until ended, and the first visit's waiting line grows.
