# ADR 0286: Quiet chrome: one rounded icon style in one colour, and green kept for the mark

- **Status:** accepted (stage 279, the Farbaek program, 2026-11-26)
- **Changes:** ADR 0183's rule for icon weights (bold at 14 and 16, regular from 20) becomes bold at every size. ADR 0217 (the spectrum as each space's identity) no longer reaches the signed-in app's navigation. ADR 0183's thirteen status kinds stay; the Verified pill's look changes. The public site is not touched.
- **No migration, no new dependency.**

## Context

On 2026-11-26 the owner put Farbaek's sidebar beside ChatGPT's, twice.

First the desktop one, asking for icons that are "clean, modern, professional", with "consistent sizing, stroke weight, visual style", and to "avoid unprofessional or inappropriate colour combinations, including excessive use of gold and green". They marked two screens: the first-steps track, and a list of tasks with a green Verified pill on every other row.

Then the phone's menu, with the instruction: "Use smooth, rounded, curved icons consistently throughout the entire platform, following the same visual style as the icons shown in the reference image." Those icons have a full stroke with round ends and round corners, in one ink colour.

What they were looking at in Farbaek:

- **The sidebars drew each space in its own colour and filled:** a blue chat bubble, a rose picture, an aqua clapper, a green hammer, at 16px in Chat and 20px in the app. Beside them, other rows were outlined or bold. Five colours and three weights in one short list.
- **Larger icons were thin.** The rule drew an outline bold at 14 and 16px and regular from 20, so that every stroke measured about the same. Beside the reference, the larger ones read as wire.
- **The first-steps track was green end to end:** a tinted ring, a green tick and a green line for every finished step.
- **The Verified pill was green three ways:** its words, its edge and its fill. A page of finished work was a column of green.

Gold was removed long ago (ADR 0008); nothing gold was found.

## Decision

**One icon style everywhere a person works: rounded, with a full stroke, in the colour of the words beside it. Green means proven, and one mark says it.**

- **An outlined icon is Phosphor's bold weight at every size,** 14 to 32px, across the signed-in app, the Office and admin consoles and the shared pages. Its strokes have round ends and round joins, which is the look the owner pointed at. A filled icon still reports a state (ADR 0183). No icon is left at the thin default, and none asks for the regular weight: `tests/design/icon-weight.test.ts` holds both.
- **Navigation icons take the colour of their row's words.** No row's icon is filled or coloured, in Chat's sidebar, its folded rail or the app's sidebar. The row you are on is said by its background, its weight and its ink.
  - The phone's tab bar keeps a filled icon for the tab you are on. It is every phone's convention, the bar has no background to carry the place, and it was already one colour.
- **Three shapes change for rounder ones,** wherever the same thing is meant: a camera for Video in place of the clapper, which is all straight edges; a folder for Projects in place of four squares; and a round tick for Approvals in place of a square one.
- **The spectrum stays where it is identity on a surface of its own:** a studio's own header, the app's Home, the public site (ADR 0217, ADR 0232). It leaves the lists people read every minute.
- **A finished first step is a plain tick in ink** on the page's raised surface, and the track's filled part is ink. The step that is next keeps the primary fill, which is where the eye should go.
- **The Verified pill keeps its green tick and loses the rest:** its words are ink and its edge is the page's line, like Done. A kind may give its mark a colour of its own (`mark`), so the pill is quiet and the mark carries the meaning. `StatusGlyph` draws the same green tick alone.
- **Chat's sidebar gains Scheduled,** under the spaces. Work Farbaek does by itself is one press from where people ask for it.

## Consequences

- Every list, heading and button in the app draws its icon in one weight. An icon added later without a weight fails a test, so the style can't drift back.
- A list of verified tasks is a column of small green ticks, not of green pills. Verified is still the only green mark, so it still stands out from Done.
- A space is recognised in the sidebar by its word and its shape. Its colour still greets the person inside the space.
- Contrast is unchanged or better: ink on the page instead of green on a green tint, and a fuller stroke at every size.
- **Not changed here:** the public site, its films and its 3D, which the owner asked to leave until the platform is finished; the notices that confirm a save or a publish, the diff view's added lines, the proof thread and the seal, each of which uses green for a result, once.
- **Not yet:** the desktop app's own window and the iPhone and Android apps, which draw their icons from other sets (SF Symbols on the iPhone).
- The icons are still Phosphor's. A different set drawn rounder still would be a new dependency and a change to every screen; it was not needed to get the look asked for.

## Verified

See `docs/stages/stage-279.md`.
