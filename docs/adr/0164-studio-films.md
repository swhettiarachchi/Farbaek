# ADR 0164: Studio films, with headlines and cards that lift out

- Status: accepted (2026-11-04).
- Changes how ADR 0034's films are shot. The stage, the recorder, the player, the budgets and the labels stay as ADR 0034, 0051, 0056, 0057 and 0061 set them.

## Context

The owner sent screenshots of the homepage films and asked for them to be recorded again, with text, and made modern, premium, 3D and professional.

What the screenshots showed:
- **Cropped interface.** To make the interface readable, the camera zoomed the whole window to about 1.3×. That cut the sidebar off at the left edge in the Build, Check and Publish clips and in the proof film.
- **Blank frames.** The Plan clip opened on an empty main area while its sections faded in. Each clip also faded the whole window out and back in at its loop point.
- **No words of its own.** A film only said what it was showing through the captions under the player.
- **A stale sample.** The film said "Harbor Café", but the template behind its preview has since become a bakery, Kiln & Crumb, so the live preview showed a different business from the one typed in.

## Decision

The films are shot in a **studio** (`src/components/films/stage/studio.tsx`), shared by every film and format.

- **Each chapter opens on a headline.** Its words rise out of masks one by one in Geist 500 at about 62 px (31 px in portrait), with one word in signal blue and a quieter line under it.
  - Example: "Say it in one sentence." Farbaek starts a project and drafts a plan.
  - The window sits beside the headline in a frosted glass frame, turned toward it in 3D, with a soft contact shadow on the stage floor.
- **Then the card that matters lifts out of the window** toward the viewer, big enough to read. Examples:
  - the build box, typed in;
  - the plan in plain words;
  - Approve and build;
  - the live preview;
  - the agent's steps;
  - the security score;
  - the publish panel;
  - the live check;
  - in the proof film, the diff, the approval bound to its hash, the sandbox checks, the ProofPack, the launch gate and the undo.
- **How a lift works.** The window behind the card falls out of focus and dims a little. A band of light crosses the card once as it rises. The pointer clicks on the lifted card. Where the card came from shows as an empty, lightly sunken place in the window.
- **A lifted card is the same interface.** It's drawn a second time and cut to the element's own box.
  - Its place is measured from the window's layout after each render, ignoring transforms, so the camera never skews a measurement.
  - It's placed on the DOM before the frame is painted, so a lift starts exactly where the element sits.
  - Elements opt in with `data-lift`, and their buttons with `data-film-click`; real components that can't carry attributes are found by their text.
- **Cards rest flat.** A card flies in 3D, then rests flat and square to the camera while it's read. A tilted layer is resampled and its text goes soft; a flat one is drawn at its true size.
  - CSS `zoom` was tried, to lay the card out at its final size. It made a sandboxed preview frame render blank, and it didn't sharpen the text.
- **The window is never cropped.** It moves between the headline pose and a centred pose behind the lifted card.
- **Clips loop without a seam.** Each clip opens on a finished frame. Over its last 700 ms the opening moment dissolves back in over the current one, so the last frame is the first.
- **The sample is the bakery the template builds,** Kiln & Crumb in Kandy, everywhere: the prompt, the plan, the run, the address (`kiln-and-crumb.farbaek.si`) and the proof film's diff.
- **Timings:**
  - "One build, start to finish" is now 58 s; "Proof before anything ships" is 43 s.
  - The build film ends on the live site in a browser window and on a phone, beside "From one sentence to a live site."
  - Posters are early frames, so the poster and the first moments of play match.
- **Headline copy follows the copy rules:** plain sentences, no em dashes, no "first". Every frame still carries "Sample project, recorded from Farbaek's interface."
- **The recorder streams frames instead of saving them** (`scripts/films/record.mjs`). This replaces ADR 0057's re-encode from saved frames.
  - The first full recording stopped with the disk full: a 58 s landscape film is several GB of lossless PNG frames, and the dev PC had under 3 GB free.
  - Each lossless frame now goes straight into ffmpeg's input. ffmpeg encodes two qualities at once (the format's starting CRF and 3 above it), and the sharper one that fits the budget is kept.
  - If neither fits, the script says so and names the `--crf` to record with.

## Consequences

- Each chapter says its idea in a few words on screen, and the interface it shows is readable without cropping the window.
- **Longer films.** The build film is 4 s longer and the proof film 11 s longer, so slightly larger files, still within the budgets of ADR 0057.
- **The lift layout is measured, not hard-coded,** so a change to the interface moves the lifts with it. A lift whose element disappears simply doesn't show.
- **The stage still renders only with `FARBAEK_FILM_STAGE=1`;** production never serves it.
- **Not verified here:** the films on an iPhone in Low Power Mode. Their silent loops are regenerated the same way as before.
