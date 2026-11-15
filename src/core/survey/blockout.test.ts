/** The block-out plan (stage 193): the SYNTHETIC Sample's lot B¹ divided and drawn, never a real plan. */
import { describe, expect, it } from "vitest";
import { blockOutDocument, blockOutSheet, divide, linesThroughBuildings, readDivision, type Division } from "./blockout";
import { crsById } from "./crs";
import { emptyDocument } from "./document";
import { SAMPLE_POINTS, sampleDocument } from "./fixtures";
import { SRI_LANKA_CADASTRAL_V1 } from "./sheet/template";

const base = { template: SRI_LANKA_CADASTRAL_V1, crs: crsById("EPSG:5235"), crsConfirmation: "Sample data: no real survey", surveyor: null, version: 3 };
const division = (d: Partial<Division> = {}): Division => ({ lot: "lot-b1", leg: 0, lines: "square", corner: 0, from: "start", by: "area", shares: [352.46, 352.46, null], rules: { id: "uda-2020" }, ...d });
const texts = (page: { items: { kind: string }[] }) => page.items.filter((i) => i.kind === "text").map((i) => (i as unknown as { text: string }).text);

describe("reading a division from its link", () => {
  it("reads one, and refuses anything else", () => {
    expect(readDivision(JSON.stringify(division()))).toEqual(division());
    for (const bad of [null, "", "oops", "{}", JSON.stringify({ ...division(), shares: [0, null] }), JSON.stringify({ ...division(), lines: "diagonal" }), JSON.stringify({ ...division(), shares: [1] }), "x".repeat(5000)]) expect(readDivision(bad), String(bad).slice(0, 30)).toBeNull();
  });
});

describe("the block-out plan", () => {
  it("works the division out again from the saved lot, and refuses one that can't be made", () => {
    const made = divide(sampleDocument(), SAMPLE_POINTS, division());
    expect(made.ok).toBe(true);
    expect(divide(sampleDocument(), SAMPLE_POINTS, division({ lot: "lot-x" }))).toEqual({ ok: false, error: "That lot isn't in this version of the plan." });
    const small = divide(sampleDocument(), SAMPLE_POINTS, division({ shares: [50, null] }));
    expect(small.ok).toBe(false);
    if (!small.ok) expect(small.error).toBe("Not every share can be made as asked, so there's no block-out plan for it:\n- Share 1: It's 50.00 m², under the UDA minimum of 150 m².\n- Share 1: Its frontage is 2.19 m, under the UDA minimum of 6.0 m.");
  });

  it("draws the shares as lots 1, 2 and 3 of lot B¹, with the new corners as drawing-only points", () => {
    const made = divide(sampleDocument(), SAMPLE_POINTS, division());
    if (!made.ok) throw new Error(made.error);
    const drawn = blockOutDocument(sampleDocument(), SAMPLE_POINTS, made.lot, made.result);
    if (!drawn.ok) throw new Error(drawn.error);
    const d = drawn.document;
    expect(d.lots.map((l) => [l.label, l.sup])).toEqual([["1", ""], ["2", ""], ["3", ""]]);
    const fresh = drawn.points.filter((p) => !SAMPLE_POINTS.includes(p));
    expect(fresh.map((p) => p.pointId)).toEqual(["P1", "P2", "P3", "P4"]);
    expect(fresh.every((p) => p.id.startsWith("b10c0000-") && p.code === null)).toBe(true);
    // Every corner of every lot is a real or a drawing-only point, and the lots add up to lot B¹.
    expect(d.lots.every((l) => l.points.every((id) => drawn.points.some((p) => p.id === id)))).toBe(true);
    expect(d.sheet).toMatchObject({ planNumber: "", surveyDate: "", partitionDate: "", planDate: "", operation: "subdivision", parentLots: "B1", statedExtent: "" });
    expect(d.adjoining).toEqual([]);
    expect(d.settings).toMatchObject({ template: "classic", scale: null, faceDimensions: true });
    expect(d.notes).toEqual(["Sub division of lot B1 planned by Farbaek Survey Studio (partition/1.1.0). Corners P1 to P4 are worked out from the surveyed corners and not yet pegged."]);
    // A lot without a raised part gives B¹, B², B³.
    const plain = { ...made.lot, sup: "" };
    const p = blockOutDocument(sampleDocument(), SAMPLE_POINTS, plain, made.result);
    expect(p.ok && p.document.lots.map((l) => [l.label, l.sup])).toEqual([["B", "1"], ["B", "2"], ["B", "3"]]);
  });

  it("prints as a block-out plan: its heading, the not-yet-surveyed notice, no survey dates, and its own plot stamp", () => {
    const out = blockOutSheet(base, sampleDocument(), SAMPLE_POINTS, division());
    if (!out.ok) throw new Error(out.error);
    const front = texts(out.sheet.pages[0]!);
    expect(front).toContain("BLOCK OUT PLAN");
    expect(front).not.toContain("PLAN");
    expect(front.join(" ")).toContain("NOT YET SURVEYED.");
    expect(front.join(" ")).not.toContain("DRAFT.");
    expect(front.some((t) => t.startsWith("Surveyed"))).toBe(false);
    expect(front).toContain("Farbaek Survey Studio, block-out plan from version 3, a planned division worked out by partition/1.1.0, not a survey. survey-engine/2.0.0.");
    expect(out.sheet.scale).toBe(500);
    expect(out.sheet.findings.filter((f) => f.blocks.includes("export"))).toEqual([]);
  });

  it("says which dividing lines run through a building", () => {
    const made = divide(sampleDocument(), SAMPLE_POINTS, division());
    if (!made.ok) throw new Error(made.error);
    // The Sample's building lies across the line from P1 to P2 only.
    expect(linesThroughBuildings(sampleDocument().features, SAMPLE_POINTS, made.result.segments)).toEqual([0]);
    expect(linesThroughBuildings(emptyDocument().features, SAMPLE_POINTS, made.result.segments)).toEqual([]);
  });
});
