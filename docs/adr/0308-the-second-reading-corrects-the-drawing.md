# ADR 0308: The second reading corrects the drawing, and Survey Studio's free AI has ten days with more room

- **Status:** accepted (stage 302, 2026-11-28)
- **Changes:** ADR 0271 (the independent check only asked), ADR 0212 (Survey Studio's free AI allowance), for ten days.

## Context

Walking the live product as a surveyor (stage 301) gave the owner's real lot as 168.26 m² against the printed 132.53 m². The first read of the sketch drew two right-hand walls, 23 to 5 and 22 to 5, each once; with no outline from lines read twice, Farbaek took the largest outline, through 23. The independent check (the second reading) said exactly that: 23 to 5 isn't drawn on the sketch, 22 to 5 is. It only asked, on a card among 47.

The same day the owner's own read stopped with "Survey Studio's free AI has reached today's limit", and they asked for the feature's AI to be free for the next ten days.

## Decision

- **A line is left out when both readings say so:** the first read drew it once and wasn't sure of it, and the second reading doesn't find it drawn (its verdict about the same numbers, either way round). A line read more than once, or read with certainty, is never left out: it's asked about, as before.
- **What it drew is redrawn without it,** by the redraw a number's correction uses (ADR 0257): only items still waiting for the surveyor change; anything confirmed is never touched. Nothing is left out when it would cost the plan a lot.
- **It's said, and undone in a press.** Each line left out is kept in the sketch's record with its numbers and what the check said (`leftOut`, written only by reading), and has a card: "Farbaek left out the line through 23, 5: …", with Leave it out and Put it back. It holds approval until answered, as a doubt does.
- **Ten days with more free AI:** until 8 December 2026, Survey Studio's free AI may use $10 a day across every workspace (from $3), inside the platform's own $20, and one person 60 drafts and 60 photo reads a day (from 20). It ends by itself; nothing is charged; a workspace's own key is unaffected.

## Consequences

- On the real job's live read, the lot comes out as the surveyor's, 1-35-18-20-21-22 = 132.70 m², and the list drops from 47 to 41.
- The house is still drawn wrong from that sketch (now 116.95 m², before 90.75 m², against about 82 m² printed): its walls aren't closed on the sketch, and a building from the face round its label spreads. That is the next fix.
- Farbaek's Claude credit can spend up to $100 more over the ten days on Survey Studio's free AI.
