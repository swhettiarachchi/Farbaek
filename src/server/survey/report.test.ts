/**
 * The checks and sources report (stage 236): what it says, that every line stays inside the page, and that it is a real PDF.
 * The project is Farbaek's SYNTHETIC sample; the traverse figures below are made up.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { filledCounts, reportPages, sourceNotes, type ReportInput } from "@/core/survey/export/report";
import type { Finding } from "@/core/survey/qc";
import { textWidth, type SceneText } from "@/core/survey/sheet/scene";
import { buildPlan } from "@/core/survey/view";
import { renderPdf } from "./pdf";
import { planInputFor } from "./present";
import { exportName, reportInputFor } from "./report";
import { sampleProject } from "./sample";

const texts = (input: ReportInput) => reportPages(input).map((p) => p.items.filter((i): i is SceneText => i.kind === "text"));
const all = (input: ReportInput) => texts(input).flat().map((t) => t.text).join(" ");

async function sampleInput(): Promise<ReportInput> {
  const data = sampleProject();
  const input = await planInputFor(data);
  return reportInputFor(data, input, buildPlan(input), new Date("2026-11-23T12:00:00Z"));
}

const traverse = {
  engine: "reduce/1.0.0",
  points: 61,
  stations: 5,
  traverse: { start: "CP1", through: ["T2", "T3"], stations: 4, closesOn: "CP1", length: 412.5, misclosure: { dE: 0.008, dN: -0.009, linear: 0.012 }, precision: 34_375, adjusted: { method: "compass", engine: "adjust/1.0.0", largest: 0.004, corrections: [] } },
};

describe("what each import's record says was worked out", () => {
  it("names the reduction, the traverse's closure and the rule the surveyor chose", () => {
    const notes = sourceNotes({ by: "autosurvey", reduction: traverse });
    expect(notes[0]).toBe("Imported by Generate Plan.");
    expect(notes[1]).toBe("61 points worked out from the instrument's observations at 5 stations (reduce/1.0.0).");
    expect(notes[2]).toBe("Traverse from CP1 through 4 stations, closing on CP1, 412.500 m long: it closed with a misclosure of 0.012 m (0.008 m east, -0.009 m north), 1 in 34,375.");
    expect(notes[3]).toBe("Adjusted by the compass rule (Bowditch), as the surveyor chose (adjust/1.0.0); the largest correction was 0.004 m.");
  });

  it("says a misclosure under half a millimetre as the import does, not as rounded zeros", () => {
    const tiny = sourceNotes({ reduction: { ...traverse, traverse: { ...traverse.traverse, misclosure: { dE: 0.0002, dN: -0.0003, linear: 0.00036 }, precision: 1_145_833 } } });
    expect(tiny[1]).toBe("Traverse from CP1 through 4 stations, closing on CP1, 412.500 m long: it closed within half a millimetre.");
  });

  it("says when a traverse was left as shot or closed exactly", () => {
    const asShot = sourceNotes({ reduction: { ...traverse, traverse: { ...traverse.traverse, adjusted: null, precision: null, misclosure: { dE: 0, dN: 0, linear: 0 } } } });
    expect(asShot).toEqual([
      "61 points worked out from the instrument's observations at 5 stations (reduce/1.0.0).",
      "Traverse from CP1 through 4 stations, closing on CP1, 412.500 m long: it closed exactly.",
      "Not adjusted: the points are where the observations put them.",
    ]);
  });

  it("leaves out a record it can't read rather than guess at it", () => {
    expect(sourceNotes({})).toEqual([]);
    expect(sourceNotes({ reduction: { points: "many" } })).toEqual([]);
    expect(sourceNotes({ reduction: { ...traverse, traverse: { ...traverse.traverse, adjusted: { method: "least squares", engine: "x", largest: 0 } } } })).toEqual([]);
  });
});

describe("the checks and sources report", () => {
  it("counts what was drawn from the field codes and what AI filled, and how many the surveyor confirmed", async () => {
    const data = sampleProject();
    const doc = { ...data.drawing.document, provenance: { "sheet.planNumber": { source: "ai_photo" as const, reviewed: true }, "sheet.landName": { source: "ai_brief" as const, reviewed: false }, codes: { source: "engine" as const, reviewed: false }, "lot:gone": { source: "auto" as const, reviewed: false } } };
    // The removed lot's mark is left over: it isn't counted.
    expect(filledCounts(doc, (k) => k !== "lot:gone")).toEqual({ drawn: { total: 0, confirmed: 0 }, ai: { total: 2, confirmed: 1 } });
  });

  it("reports the sample's version, coordinate system, source with its SHA-256, every check, and that it certifies nothing", async () => {
    const r = await sampleInput();
    const text = all(r);
    expect(text).toContain("Checks and sources report");
    expect(text).toContain("Sample land survey");
    expect(text).toContain("EPSG:5235");
    expect(text).toContain(`SHA-256 ${"0".repeat(64)}`);
    expect(text).toContain("This report certifies nothing.");
    // Made now, with today's checks: said, and never dated as the version.
    expect(text).toContain("This report was made 2026-11-23 12:00 UTC, with the checks as they stood then.");
    for (const f of r.findings) expect(text).toContain(f.code);
    expect(text).toContain("survey-engine/");
  });

  it("keeps every line inside the page's margins, and numbers the pages", async () => {
    const narrow = "il".repeat(150);
    const many: Finding[] = Array.from({ length: 120 }, (_, i) => ({ code: `TEST_${i}`, severity: i % 2 ? "warning" : "error", message: `A long synthetic finding number ${i} that runs well past the width of one line of the page so that it has to wrap onto the next line.`, detail: "Synthetic detail.", action: "Synthetic next step.", blocks: ["export"], target: { kind: "project" } }));
    // A 120-character project name (the most a name holds), a long file name, and one of narrow letters, which an ellipsis outgrows.
    const r = {
      ...(await sampleInput()),
      projectName: "Survey of the land called Pansalawatta and the adjoining allotments along the old Kandy road, synthetic sample",
      findings: many,
      sources: [
        { name: `a-very-long-file-name-${"x".repeat(200)}.sdr`, format: "sdr", sha256: "f".repeat(64), sizeBytes: 2_400_000, points: 3_070, at: "2026-11-23T10:00:00Z", notes: [] },
        { name: narrow, format: "csv", sha256: "e".repeat(64), sizeBytes: 10, points: 1, at: "2026-11-23T10:00:00Z", notes: [] },
      ],
    };
    const pages = reportPages(r);
    expect(pages.length).toBeGreaterThan(2);
    pages.forEach((p, i) => {
      expect([p.widthMm, p.heightMm]).toEqual([210, 297]);
      const ts = p.items.filter((x): x is SceneText => x.kind === "text");
      for (const t of ts) {
        expect(t.x).toBeGreaterThanOrEqual(18);
        expect(t.x + textWidth(t.text, t.size, t.font)).toBeLessThanOrEqual(192.01);
        expect(t.y).toBeGreaterThan(18);
        expect(t.y).toBeLessThan(297 - 10);
      }
      expect(ts.at(-1)!.text).toContain(`page ${i + 1} of ${pages.length}`);
    });
    // A file name longer than the line is cut to fit, never run off the page.
    expect(all(r)).toContain("…");
  });

  it("sums up a sketch read, counting readings it couldn't check as not checked", async () => {
    const r = { ...(await sampleInput()), sketch: { reader: "Claude", at: "2026-11-23T10:00:00Z", photos: 2, readings: 9, agree: 4, close: 1, differ: 1, unmatched: 1, unchecked: 2, unreadable: 1 } };
    expect(all(r)).toContain(
      "2 photos were read by Claude on 2026-11-23 10:00 UTC: 9 readings, of which 4 agree with the survey, 1 is within the usual measuring difference, 1 differs, 1 names a point the survey doesn't have and 2 couldn't be checked. 1 piece of writing was seen but not read.",
    );
  });

  it("says why an approval no longer applies, and what the approval confirmed", async () => {
    const base = await sampleInput();
    expect(all({ ...base, lapsed: "crs_changed" })).toContain("Draft: not approved. An approval of this version no longer applies: the project's coordinate system changed after it.");
    const drawn = { ...base, filled: { drawn: { total: 3, confirmed: 1 }, ai: { total: 0, confirmed: 0 } } };
    expect(all(drawn)).toContain("the rest are confirmed when the surveyor approves the plan.");
    expect(all({ ...drawn, approval: { by: "A. Surveyor", at: "2026-11-23", sha256: "c".repeat(64) } })).toContain("the approval confirmed the rest.");
  });

  it("never claims more of the history than it read", async () => {
    const base = await sampleInput();
    const versions = Array.from({ length: 100 }, (_, i) => ({ version: 100 - i, note: null, at: "2026-11-23T10:00:00Z" }));
    expect(all({ ...base, versions, versionsCut: true })).toContain("And 70 earlier versions listed in the project, and any older ones, which weren't read for this report.");
    expect(all({ ...base, versions: versions.slice(0, 31), versionsCut: false })).toContain("And 1 earlier version.");
  });

  it("is a PDF with one page for each page of the report", async () => {
    const pages = reportPages(await sampleInput());
    const pdf = (await renderPdf(pages, { title: "Checks and sources report: sample", subject: "Synthetic test", createdAt: new Date("2026-11-23T00:00:00Z") }, { compress: false })).toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(pages.length);
  }, 30_000);

  it("names each kind of file in the project's history", () => {
    expect(exportName({ kind: "pdf", options: { content: "report" } })).toBe("Checks and sources report (PDF)");
    expect(exportName({ kind: "pdf", options: {} })).toBe("Plan (PDF)");
    expect(exportName({ kind: "csv", options: { content: "lots" } })).toBe("Lot schedule (CSV)");
    expect(exportName({ kind: "dxf", options: {} })).toBe("Drawing (DXF)");
  });
});
