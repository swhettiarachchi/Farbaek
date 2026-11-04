# Stage 152: The site review leaves ranges alone

- **Branch:** `fix/review-range-dash`, from `main` after PR #194.

## What happened

- The owner ran Keep going on Sunrise Bakery's design upgrade, asking the agent to fix whatever the site review flags.
- The review's only "fix" item was the en dash in the opening hours ("6:00 am – 7:00 pm"). The plan protected that text, so the agent correctly changed nothing, and the run ended with nothing to apply.
- An en dash in a range is correct typography, not an AI tell. The Studio standard (`src/core/agent/studio-standard.ts`) only bans the em dash. The review was stricter than the standard and sent agents after correct text.

## What changed

- **`review_site`** (`src/core/agent/site-review.ts`):
  - An en dash between two numbers, times or days is a range and passes: "6:00 am – 7:00 pm", "2019–2024", "Mon–Fri", "9:30am–5pm".
  - An em dash anywhere is still flagged, and so is an en dash between words ("Fast – and quiet").
  - The message now says "an em dash, or an en dash outside a range".

## Verified

- New test: six ranges pass; an en dash between words and two em dashes are flagged.
- The site review tests pass (10). Typecheck and lint are clean.

## Next

- After the merge, Sunrise Bakery's review has nothing to fix apart from its six stand-in photos and videos, which the owner replaces in Studio.
