# ADR 0303: Scanned PDFs of the deed or an old plan are read as they are

- **Status:** accepted (stage 296, 2026-11-28)
- **Builds on:** ADR 0301 (the deed read into the title at the start), "Read an old plan" (ADR 0202), the owner's AutoSurvey brief (field sketches and reference drawings may come as PDFs).
- **Changes:** which files the title reader takes. No migration, no new dependency.

## Context

A deed or an earlier plan often arrives as a scanned PDF. The start screen listed every PDF as "Documents aren't read yet", and "Read an old plan" took photos only. Turning PDF pages into pictures in the browser or on the server needs a PDF library, a new dependency; Claude reads a PDF's pages itself when it's sent as a document.

## Decision

- **A PDF on the start screen is read as the deed or an old plan**, into the title after the plan is drawn, like a photo marked so (ADR 0301), within the same consent box. "Read an old plan" on the Draft step takes PDFs too.
- **It's sent as it is**, as a PDF document to Claude, never opened or converted by Farbaek. The server knows a PDF by its own first bytes (`%PDF-`), never its name or the browser's type, and takes one of up to 3 MB; photos stay at 1.8 MB, and everything in one read within 5.5 MB, under the 6 MB a server action carries.
- **Sketches as PDFs aren't read yet.** A sketch's photo is kept with the plan and shown beside each reading with its region marked, which needs the page as a picture. A PDF is never offered as a sketch, so nothing pretends to read one.

## Consequences

- A deed scanned to PDF fills the title in the same way as a photo, each fact waiting for the surveyor.
- What a PDF costs to read follows Claude's per-page pricing, within the same free daily allowance while Survey Studio is tested.
