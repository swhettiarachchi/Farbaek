# ADR 0200: The survey plan's PDF and DXF writers

- **Status:** accepted
- **Date:** 2026-11-15
- **Stage:** 190
- **Builds on:**
  - ADR 0198 (Survey Studio as a module);
  - ADR 0201 (one sheet scene for preview, PDF and checks).

## Context

A survey plan is printed at a stated scale and taken into CAD. The survey skill asks for real vector PDFs, never a screenshot, with embedded fonts and an explicit 100% print option, and for DXF output that another reader opens with its layers intact. The repo pins exact versions and avoids releases only days old.

The research (`reports/Survey Studio standards and tech.md`, sources accessed 15 November 2026) compared the options:

**PDF libraries** (versions and dates from the npm registry):

| Package | Latest | Released | Finding |
| --- | --- | --- | --- |
| pdfkit | 0.20.2 | 2026-08-30 | Embeds TrueType and OpenType fonts through fontkit, sets page sizes in points, draws vector paths with dash patterns, caps and joins. fontkit sends Sinhala and Tamil to its Indic shaper, and PDFKit writes each glyph's offsets |
| pdf-lib | 1.17.1 | 2021-11-06 | Simpler, with a bottom-left origin and `setPrintScaling`, but no release since 2021. Its custom font embedder writes glyph ids and advances and never reads the shaper's offsets, so it would misplace Sinhala and Tamil vowel signs (derived from its code) |
| jspdf | 4.2.1 | 2026-03-17 | Documents no complex-script shaping |

The stage plan had named pdf-lib as the front runner; the research changed that.

**DXF versions.** R12 (AC1009) needs only an ENTITIES section and no handles. R13 and later, including R2000, need a header with `$HANDSEED`, a CLASSES section, default table entries, BLOCK_RECORDs, an OBJECTS dictionary and unique handles everywhere (ezdxf documentation). The ready-made writer `@tarikjabiri/dxf` 2.10.1 was published one day before the research. DIMENSION entities depend on anonymous blocks and a DIMSTYLE, and many JavaScript readers skip them and MTEXT.

## Decision

### PDF: PDFKit 0.20.2

- `renderPdf` in `src/server/survey/pdf.ts` draws the composed sheet scene (ADR 0201) as vector paths and text, on the server only.
- **Scale.** Every millimetre of the scene becomes `MM_TO_PT = 72 / 25.4` points, so a drawing composed at 1:500 measures 1:500 when printed at 100%. The scene is already top-down, like PDFKit's user space, so no flip is needed.
- **PDF 1.7**, with `/ViewerPreferences << /PrintScaling /None >>` written into the catalog (PDFKit has no call for it; the code sets it on the preferences object PDFKit creates for `displayTitle`). This only asks viewers to preselect no scaling. The sheet also carries a 100 mm check line and says to print at 100% (actual size), and nothing calls a sheet guaranteed to print at scale.
- **Fonts.** Geist and Geist Mono (SIL Open Font License 1.1) from `android/app/src/main/assets/fonts/`, embedded as subsets. They are variable TrueType fonts with Latin glyphs; bold is drawn by stroking the outline. They have no Sinhala or Tamil glyphs, so the composer refuses a sheet with such text (`TEXT_SCRIPT_NOT_SUPPORTED`), and those scripts wait for fonts and a shaping test.
- **Bundling.** `pdfkit` is in `serverExternalPackages` in `next.config.ts`, because it reads its font metric files from its own package folder at run time. fontkit 2.0.4 comes with it. `@types/pdfkit` 0.17.7 is a dev dependency.
- The file's dates are the drawing version's creation time, so the same version gives the same document.

### DXF: a hand-written R12 writer

- `writeDxf` in `src/core/survey/export/dxf.ts`, plain TypeScript in the engine, about 250 lines.
- **R12 (AC1009)**, ASCII, with HEADER (`$ACADVER`, `$INSBASE`, `$EXTMIN`, `$EXTMAX`), TABLES (LTYPE, LAYER, STYLE) and ENTITIES. No handles.
- **Entities:** `POLYLINE` / `VERTEX` / `SEQEND` for the boundary and features, `POINT` for boundary points, `TEXT` for everything written. **No DIMENSION**: bearings and distances are rotated TEXT, so every reader shows the same thing. No MTEXT, LWPOLYLINE, BLOCK or INSERT.
- **Real coordinates** in model space: X easting, Y northing, metres, 4 decimals, never in exponent form. Text heights are the sheet's paper sizes at the plan's scale.
- **Escaping:** ° becomes `%%d`, primes become `'` and `"`, line breaks become spaces, and every other non-ASCII character becomes `\U+XXXX`, the one encoding the research found working in every DXF version.
- **Units.** The writer puts no units variable in the header; notes on the TEXT layer say the units, the axes, the CRS, the bearing convention, the text scale, the engine version, and whether the plan is a draft or approved and its CRS confirmed. The research recommends `$INSUNITS = 6` and `$MEASUREMENT = 1` (ezdxf's guidance, from BricsCAD experiments); adding them is open.
- Layers hidden in the drawing are written switched off, with their entities kept.

### Verification

- **DXF:** the tests parse the output with dxf-parser 1.1.2 (MIT), a reader that shares no code with the writer, and check the layers, the closed boundary's vertices to 1 mm, the point numbers, the degree escape and the POINT count.
- **PDF:** the tests render uncompressed and read the bytes back: the PDF version, `/PrintScaling /None`, the MediaBox, two pages, embedded TrueType fonts and no Helvetica fallback, and the boundary's first path operators at exactly the scaled positions, so a leg's drawn length equals its ground length at the plan's scale.

## Consequences

- One PDF library that can shape Sinhala and Tamil when fonts arrive, kept on the server. The research's caveats stand: the offset handling was read in PDFKit 0.17.2, not 0.20.2, and a glyph comparison with HarfBuzz must gate any Sinhala or Tamil release.
- A small DXF writer we own, with no new runtime dependency and no days-old package. R2000 output waits until the writer builds the full object graph and matches a known-good ezdxf file.
- Printing at scale depends on the viewer honouring the request; the check line lets anyone measure it.
- Still manual: opening sample DXFs in AutoCAD, LibreCAD and QCAD, an ezdxf audit, and opening the PDF in two viewers.
