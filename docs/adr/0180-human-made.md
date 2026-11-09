# ADR 0180: Human-made, not generated

- Status: accepted (2026-11-07). Its status decision ("an icon only for done and failed") is replaced by ADR 0183: every status is a kind with its own icon.
- Extends ADR 0008 (White Signal), ADR 0049 (natural type), ADR 0153 (plain icons), ADR 0156 (premium by default) and ADR 0170 (plain words).

## Context

The owner sent six crops of Farbaek's own screens and asked for everything that makes them look AI-made to go: a "Turning on" chip with an hourglass, a flask standing in for a word, a "Needs approval" chip with an hourglass, a lone "0:00", a sentence squeezed into a chip with a question mark, and a card of monospace tool names with coloured dots. They set a permanent standard: Farbaek, and everything built with it, must read as a product made by a large company's team of engineers and designers, so that nobody can tell Farbaek was used.

Each crop is small. The pattern is what gives it away:
- **A glyph on every status chip.** Farbaek had 56 hourglasses, 32 flasks and 28 fingerprints. A real product reserves icons for the states people scan for.
- **Monospace for words.** Model ids ("claude-haiku-5-5") and tool names in mono say "machine". People copy hashes and paths; they don't copy a model's name.
- **Dots before lines.** Decoration dressed as status.
- **Counters with nothing to count.** A film player read 0:00 before it played. A run showed a strip of pills: Steps, model, usage, cap.
- **Sentences in chips.** "1 change no line of the plan explains", with an icon, as a pill.

The taste skills the owner uses name the same tells for generated websites: eyebrows over every section, numbered sections, version stamps, scroll cues, city-and-time strips, decorative dots, monospace labels, fake-precise numbers, em dashes. Farbaek's Studio standard already banned some of these for what the agent builds, not all.

## Decision

**Status is a word.** A status chip is its label, in its colour, with a solid or dashed border. An icon only for done (a check) and failed (a warning or prohibit). Waiting states carry no icon and say who they wait for. A trial or practice result says "Sample". `StatusBadge` and `RunStatusBadge` are the one way to draw a status, and every state table in the app follows the same rule, including the desktop app and the iPhone app.

**Mono is for data people copy.** Hashes, paths, commands, addresses and keys. A model is shown by its product name through `modelName()`. A tool by its verb. A state by its word.

**No drawn dots.** A spinner for live work, a check or warning for a result, real list bullets for lists. The unread marker stays, as in every mail app.

**Numbers only when real and useful, in sentences.** The run page says "Step 7 of a Balanced run on Claude Haiku 5.5. Used 2% of this month's AI usage, with a cap of 8%." A film shows its length until it plays. Facts about a change are lines in a list.

**Icons name the action.** Approve is a check. Try is play. Top up is a plus. Priority support is the lifebuoy. Lightning, flasks, fingerprints and circuits are gone, with the sparkles and robots ADR 0153 removed.

**The same standard for what Farbaek builds.** The Studio standard names the tells in the same words, and `review_site` flags the ones a scan can find: scroll cues, version stamps, numbered sections, "Quietly trusted by", city-and-time strips, too many uppercase labels and decorative dots.

**It's enforced.** `tests/design/human-made.test.ts` fails on the icons, the dots, mono on a model and a literal 0:00, on the web, in the desktop app and in the iPhone app. The `farbaek-human-made` skill holds the full table of tells and what replaces each, for every future change. `CLAUDE.md` points at both.

## Consequences

- Chips lose their glyphs and gain nothing: colour, border and the word were already carrying the meaning, and colour was never alone (CLAUDE.md's rule is restated: label and pattern, an icon only for done and failed).
- The films' stage components changed, so the recorded films show the old chips until they're re-recorded (`pnpm films:record`), which the words and captions tests don't require.
- The desktop app's change reaches people with its next release. The iPhone app's with its next build.
- A site Farbaek builds now gets the production tells flagged in its review, so the agent fixes them before finishing.
