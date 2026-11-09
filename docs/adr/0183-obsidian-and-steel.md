# ADR 0183: Obsidian and steel: one status system, one icon set, no gold

- **Status:** accepted
- **Date:** 2026-11-08
- **Stage:** 172
- **Changes:** ADR 0180's "status is a word" decision (status is now its word, icon, colour and border together), and ADR 0153's stale rows.

## Context

The owner looked at Farbaek on a phone and found it cheap in places:

- **Gold:** "Needs approval" was drawn in a brown amber (`--approval` #9a4d00) on a beige wash. It's the most common state in the product, and it read as gold, which doesn't suit the brand.
- **Unfinished:** stages 169 and 170 had taken the AI-looking icons out of status chips, headings and rows, but left nothing in their place. A "Verified" chip had a check, and the "Needs approval" chip beside it had nothing.
- **Mixed signals:** blank spacers sat where icons used to be. "Sample" chips were purple, panels had a blue glow under them, and there were hazard stripes.

Audits of colour, components and icons found the causes:

- one token used for two opposite meanings ("your turn" and "warning");
- about 30 status tables, each with some states iconed and some blank;
- icons in 20 sizes and three weights;
- rules that contradicted each other.

## Decision

**Colour (src/styles/tokens.css).** The brand is obsidian ink, a steel neutral ramp, and signal blue. Status colours each mean one thing:

| Token | Value | Means |
| --- | --- | --- |
| `approval` | #2450f0, the accent | A person has to decide or act: your turn |
| `caution` | #b04508, burnt orange | Look before going on: a real warning, a limit near, a deadline closing |
| `verified` | #0b6e4f | Done and proven |
| `failed` | #b3243b | Ended badly, or stopped by a rule |
| `info` | #3d5572, steel | Information, and work in progress |
| `unverified` | #5f636b, dashed | Not yet |
| `simulated` | #4b5160, graphite | Sample or practice data |

- No amber, no gold, no purple. `tests/design/contrast.test.ts` rejects any token in those hues and checks every text pair.
- Shadows are tinted with ink, not with the accent.
- New tokens: `line-2` for quiet outlines, `accent-strong`, `primary-hover`, and `media-caution` in place of the media panel's amber.

**Status kinds (src/components/ui/status-badge.tsx).** Every status chip is a `StatusBadge` of one of thirteen kinds. Each kind has its words, a Phosphor icon, its colour and its border. `StatusGlyph` draws the same icon alone for rows and step lists.

| Kind | Icon | Use for |
| --- | --- | --- |
| verified | CheckCircle, fill | Verified, Passed, Live, Connected, Resolved, Undone |
| done | CheckCircle, fill, ink | Finished without proof: Plan approved, Finished run |
| approval | ClockUser, fill, blue | Waiting for your approval, Needs review, Your turn |
| pending | Clock, fill, steel | Waiting on someone else or a system: Queued, Requested, Waiting for DNS |
| working | CircleNotch, turning | Working, Checking, Sending (still under reduced motion) |
| attention | WarningCircle, fill, orange | Needs a look: Partly verified, Payment due, Closing soon, Changed |
| paused | PauseCircle, fill, orange | Paused, Interrupted |
| failed | XCircle, fill | Failed, Rejected, Checks failed |
| blocked | Prohibit, fill | Stopped by a rule, Not allowed, Taken offline |
| unverified | CircleDashed, dashed border | Not verified, Not run, Draft, Not tried yet |
| off | MinusCircle, fill, ink | Cancelled, Expired, Declined, Not connected, Inactive, Skipped |
| info | Info, fill, steel | A neutral fact |
| simulated | Eye, fill, graphite | Sample, Practice mode |

- A task's kind comes from `stateKind()` in `src/core/realityloop/progress.ts`.
- Tags that aren't states (a role, "This device", "Pro") are neutral pills with no icon.
- The iPhone's `Tone` and the desktop app's badges use the same kinds, with their SF Symbol twins.

**One icon set.**
- Phosphor on the web and desktop, SF Symbols on the iPhone. No second library.
- Filled icons report a state. Outlined icons name a thing or an action.
- Sizes are 14, 16, 20, 24 and 32. Outlined icons are `bold` at 14 and 16 and regular from 20, so every stroke looks about the same.
- The same concept gets the same icon everywhere, and a page's concept takes its navigation icon.

**Section titles carry their icon.** Every section heading in the signed-in app uses `CardTitle`: a 20px outlined icon in the quiet ink, then the words. It's the same on every section, never a tinted tile. Marketing headlines stay words only.

**Messages carry theirs.**
- Every error message has WarningCircle (filled, failed colour), and every success has CheckCircle (filled, verified colour).
- Notices sit on a neutral surface, with the icon's colour saying info or warning.
- Empty states use a neutral icon tile on a solid border.

**Still banned:**
- sparkles, robots, wands, brains, rockets and skulls;
- hourglass, flask, test tube, fingerprint, circuitry and lightning;
- status dots, emoji, and tinted icon tiles on headings.

## Consequences

- Blue now means "your turn" everywhere, the same blue as the brand, so the product's most common state reads as an invitation, not a warning. Orange appears only where something needs a look.
- Status chips are one component, so a new state can't arrive half-drawn.
- The recorded films still show the old chips until they're re-recorded.
- The iPhone and desktop apps change with their next builds.
