# ADR 0263: Words on the plan, and a symbol given to a surveyed point

- **Status:** accepted (stage 255, AutoSurvey, 2026-11-24)
- **Builds on:**
  - ADR 0261 (the editor's properties panel);
  - ADR 0249 (a symbol the sketch gives a point);
  - ADR 0242 (labels placed together and dragged on paper).
- **Changes:**
  - the plan's document gains optional `texts`;
  - a point's panel sets `symbols`, which already existed;
  - the sheet, the Reference and the DXF draw both.

  No migration, no new dependency.

## Context

A surveyor's plan carries words the survey doesn't: "Gate" written along the lot's side, "Proposed Drain" along the road. It also shows marks the field codes didn't name, such as an electric post (EP) at a point surveyed without its code. The owner's real job has all three on the surveyor's plan, and Farbaek had no place for any of them. The owner's editor brief asks for adding text and symbols on the sheet.

## Decision

**Words on the plan** (`texts`, at most 100), each:

- beside a surveyed point, written level; or
- along the line from it to another surveyed point, turned to read along it, outside the lot first.

They're placed like every other label, clear of the rest; can be dragged on paper (their offset is presentation, as for any label); and hide and lock with the Text layer. The DXF writes them on its Text layer, at the point or the line's middle, turned with the line. Nothing is measured from them, and no coordinate comes from them.

**A symbol given to a point:** the point's panel says what it's drawn as, from the code list's marks and symbols (EP, Electric Post), or "as surveyed". The point never moves. It's drawn as that mark, and the Reference now lists a mark given this way (before, only the point's own code was listed). A lot's corner is drawn as a corner, so it isn't offered there.

**In the editor:** tap a point, or find it by its number on the Selected tab (a point surveyed without a mark's code isn't drawn, so it can't be tapped), then in its panel:

- choose "Drawn as";
- or type words, optionally "along the line to point" with that point's number, and Add.

Tap words on the sheet to change them or remove them (after a second press). A number two points share, an unknown number, or the point itself is refused, with the reason.

Both fields are absent until first used, and go again when the last is removed, so a plan without them, and its approval, are unchanged.

**Kept honest:**

- words that can't fit inside the drawing are said by the plan's checks;
- the points words stand at count as points the plan uses;
- comparing two versions lists words added, changed or removed, and symbols given or taken away;
- a lot's corner given a symbol isn't listed in the Reference, since it's drawn as a corner, and its panel can remove the symbol.

## Verified

- **`sheet/texts.test.ts`** (synthetic):
  - words along a side are turned with it and outside the lot, and words beside a point are level;
  - a drag moves them only on paper, and the Text layer hides them;
  - the DXF has them on its Text layer, turned 90° along a north-running side;
  - empty words, or more than 100, are refused;
  - a point given EP draws as EP and the Reference lists Electric Post, the point unchanged.

## Review

A fresh review found three faults, all fixed:

- a symbol at a lot's corner was listed in the Reference but never drawn;
- a point surveyed without a mark's code couldn't be tapped, so it couldn't be given a mark or words;
- comparing versions said nothing changed when only words or symbols had.

Also from it:

- words stay inside the drawing or are reported;
- the words field follows an undo;
- the panels respect the Boundary marks and Text layers' locks and say when Text is hidden;
- the fields have visible labels and their hints are tied to them;
- the zoom buttons stay on narrow windows (the toolbar wraps instead), so a desktop zoomed to 200% keeps them.

## Not done, and why

- **Text size and rotation by hand:** words take the plan's label size and their line's direction. A size of their own is a schema addition for when a plan needs it.
- **The assistant** doesn't add words or symbols yet: the panel does.
