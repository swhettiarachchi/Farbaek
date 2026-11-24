# ADR 0255: A number written where another point belongs is asked about

- **Status:** accepted (stage 247, AutoSurvey, 2026-11-24)
- **Builds on:**
  - ADR 0253 (each reading's place on its photo, evidence only);
  - ADR 0254 (crossing lines asked about);
  - ADR 0249 (the Sketch Intelligence Engine).
- **Changes:**
  - one new check, `sketchintel/placement.ts`;
  - questions from it;
  - what the lot's card says;
  - the report's ranking.

  No migration, no new dependency, no change to what's stored.

## Context

With stage 246 live, the production reader read the owner's real sketch a third time, on 2026-11-24. It read the north side's corner 21, and Farbaek found a lot for the first time: 35, 34, 33, 17, 14, 18, 10, 21, 22, 5, 1 and 2, 112.26 m² against the surveyor's 132.70 m². Two misreads made it wrong:

- **10 where the sketch has 20:** the upside-down 20, read as 10, and 10 is another surveyed point on the house wall.
- **14 on the west wall,** making a notch.

Stage 246's crossing check asked about the wall through 10. But the lot's own card didn't say so, and the misread number itself had nothing pointing at it.

Since stage 245, every number comes with its place on the photo. A field sketch isn't drawn to scale, but it keeps the survey's rough shape. On the real read, fitting the survey to where the numbers are written put the "10" 195 photo units from where point 10 would be, and 47 from where point 20 would be: the right answer.

## Decision

**Fit each photo's numbers to their surveyed points** with an affine map, so a photo taken turned, at a slant, or of a squashed sketch still fits. It's found by consensus, so a few misreads or a far station can't steer it:

- exact fits through three numbers are tried (all of them for up to 14 numbers, else a fixed sample of 400), each triangle judged too flat against its own size;
- the fit the most numbers agree with (within 120 photo units) is kept, if at least six do;
- least squares over those numbers refines it, in their own centred and scaled frame;
- a label written twice on one photo, and a number two surveyed points share, aren't fitted, and a shared number is never said to be out of place.

**A number is out of place** when it's at least 150 photo units (15% of the photo) from where its own point would be, and its place is within 80 of another surveyed point's, and nearer that point by half.

- **When that point's own number isn't written on the photo,** the question says "it's written where point 20 would be: it may be 20".
- **When that point's number is written there too,** it only says the number is far from where its own point would be, beside where the other is written. It isn't likely to be that point.
- **A number the survey doesn't have,** beside another that's written, is already asked about as not in the survey.

**What follows:**

- **A question per number,** once however many photos raise it, at most five, and only where the lot or a line uses the number, pointed at that, so confirming or correcting it answers the question. A number nothing uses is listed in the sketch report only.
- **The lot's card** says when one of its corners may be misread this way, or when its outline uses a line that crosses another where no number is. Its level is then "check".
- **The report** puts a misplaced number first, with the reason.

**Never more than a question.** The places are approximate and the sketch isn't to scale. Nothing drawn, no number and no position changes with them; a test holds the proposals equal with and without them.

## Consequences

On the owner's real job, the production read's places raise three questions:

- 10, written where 20 would be (it may be 20): right;
- 12, written far from point 12, beside the well's 19: the reader's "12" there is suspect;
- 14, written far from point 14, beside 17: the corner that made the notch.

The hand reading, with eight placed numbers, raises none.

The thresholds are Farbaek's defaults, measured on one real sketch. Its well-read numbers fit within about 130, so a sketch drawn far out of proportion may raise a question that confirming answers.
