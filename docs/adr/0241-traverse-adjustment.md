# ADR 0241: A traverse's closure is always said, and adjusted only by the rule the surveyor chooses

- **Status:** accepted (stage 231, AutoSurvey part 7, 2026-11-23)
- **Builds on:** ADR 0236 (reducing observations by radiation), the survey skill's rule 7 ("Adjust only with professional authorisation and an explicitly chosen method ... report residuals before and after"), the owner's AutoSurvey brief §13 (deterministic computation, inputs, method and tolerances recorded)
- **Changes:** a Sokkia SDR job whose traverse closes on a known point now has its closure reported, and can be adjusted by the compass or transit rule. No migration: the closure and the adjustment are recorded in the import's settings.

## Context

Since stage 225 an SDR job of observations is worked out by radiation, station to station, with nothing adjusted. A traverse that closes back on its start, or on another control point, showed its misclosure only as one check among others ("Point A: ... differ by 0.020 m"), with no length, no precision ratio and no way to spread it. Surveyors normally balance a closed traverse before drafting from it, but the rule they use (and whether to use one at all) is a professional choice, and adjusting silently would move a boundary without anyone deciding to.

## Decision

**Find the traverse in the job** (`src/core/survey/import/closure.ts`, format-independent):

- **What the file says about each coordinate record decides most of it.** Sokkia's derivation code (bytes 3 and 4) gives where coordinates came from:
  - KI, CJ, XD, RK and RE (keyed in, a control job, outside, RTK, a resection) are **control**;
  - TP, TV and MC are computed by the instrument from its own shot.
- **A traverse station** got its coordinates from an earlier station's shot. Either it was set up with no coordinates in its record (ADR 0236), or its record holds the coordinates the instrument carried forward from the last shot to it.
  - Carried coordinates sit within 5 mm plus 300 ppm of the shot's length of Farbaek's own reduction: the instrument and Farbaek reduce to the grid separately.
  - A station the file keys in, or that no earlier shot reached, is control and never moves.
- **A computed record of any other point** (TP, TV, MC) moves with the station whose shot it carries: the last shot to it before the record, within the same tolerance.
- **A station stands where its setup put it,** with or without a rule. Everything shot from it hangs on that position, and a later shot to it, such as the next station's backsight, is a check.
- **The closure** is a shot from a traverse station to control: a keyed-in point, or a control station such as the start of a loop.
  - A shot back to the station the traverse came from re-measures that leg and isn't a closure, and a loop needs three stations.
  - Every shot to control is considered, not only the last one. The traverse through the most stations is reported; on a tie, closing on its own start wins, then the later shot. The others stay checks.
- **Reported every time** (`TRAVERSE_CLOSURE`): the route, the misclosure in metres with its easting and northing, the length, and the precision as "1 in N". Farbaek doesn't say whether that is good enough: the survey's class does, and no limit is encoded.

**Adjust only when the surveyor chooses a rule** (`src/core/survey/adjust.ts`, engine `adjust/1.0.0`):

- **Keep as shot** is the default. The choice sits beside the closure on the start screen and in the detailed import.
- **Compass rule (Bowditch):** each station moves by the misclosure times its distance along the traverse over the whole length.
- **Transit rule:** eastings by the eastings run so far over their whole sum, northings the same way. It is refused when no leg runs in the misclosure's direction.
- **What moves:** each traverse station moves by its correction, and a station branching off one moves with it. Every point shot from a station moves with that station, since its observations from it are unchanged. Control, the closing point and heights don't move.
- **Only the linear misclosure** is spread. Angles aren't balanced first, because the angular misclosure isn't worked out, and the note says so.
- **A choice that can't be used is refused, not ignored.** Examples: a rule chosen for a file with no closing traverse, a format other than SDR, or the transit rule with no legs in the misclosure's direction. The file shows the reason, and the choice stays on screen to change.

**Recorded:**
- The import's settings keep the closure and the adjustment: method, engine, the largest move, and each station's correction to 0.1 mm. The first 40 stations are named and corrected, and the count says how many there were, since the settings hold 8 KB.
- The plan's version note says "the traverse adjusted by the compass rule (Bowditch) as chosen".
- The stored source file keeps the raw observations byte for byte, so re-reading it without a rule gives the points as shot.
- The surveyor who imports chooses. The plan's approval, by the professional responsible, covers the adjusted points like everything else on it.

**Proven twice:**
- Hand-worked answers on a synthetic loop, for both rules.
- A second implementation that corrects each leg first and runs the corrected legs from the start: it lands on the closing point exactly.
- The reader's tests cover a derived traverse, a carried-forward one, control closing before and after the shot, and every refusal.

## What it doesn't do

- **Least squares** isn't done, and **angles aren't balanced** before the linear rule.
- **A field book's legs** (bearings and distances typed from a book) still report their closure without adjusting.
- **Leica GSI** jobs have no traverse here: each GSI station is oriented on a known point (ADR 0236).
- **Not tried on a real job yet:** whether the owner's surveyor's SET650X writes station coordinates carried forward or blank decides which path finds the traverse. Both are tested, and so is a carried traverse on SLD99's grid.
- **The derivation codes are from Sokkia's 1999 document.** Newer instruments use codes outside it. An unknown code is neither control nor computed: it never moves and never closes a traverse.
- **A control station written with the coordinates a shot gives it,** within the tolerance and not keyed in, can't be told from a carried one. It would be taken as a traverse station. The closure names its route, so the surveyor sees which stations were taken as the traverse's.

## Consequences

- A closed traverse's quality is visible before the plan is drawn, in plain words, with its precision.
- A surveyor who balances their traverse can do it in Farbaek with a named rule, recorded with the import, instead of in the instrument's software first.
- Nothing moves unless someone chose it, and the choice is on record.
