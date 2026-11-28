/**
 * The second reading corrects the drawing by itself (stage 302, ADR 0308). SYNTHETIC: a 10 by 20 m lot whose top line runs on past its
 * corner 3 to 5, its right side 2 to 3 read once, and the same side misread once, with doubt, as 5 to 2 (as the owner's real job had
 * 23 to 5 beside 22 to 5): with no outline from lines read twice, the largest
 * outline then takes the misread side, and the lot comes out too large.
 */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import { emptyDocument, type SurveyDocument } from "../document";
import { exceptionsFor } from "../exceptions";
import type { SurveyPoint } from "../parcel";
import { buildPlan } from "../view";
import { applySketch } from "./apply";
import type { SketchLine } from "./drawing";
import { interpretDocument } from "./findings";
import { linesToLeaveOut, withLinePutBack, withSecondReading } from "./second-reading";
import { checkItems } from "./verify";

const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e: 500_000 + e, n: 600_000 + n, z: null, code: null });
const POINTS = [at("1", 0, 0), at("2", 10, 0), at("3", 10, 20), at("4", 0, 20), at("5", 12, 20)];
const line = (id: string, points: string[], over: Partial<SketchLine> = {}): SketchLine => ({ id, file: "s.jpg", points, label: "MW", style: "double", closes: false, certain: false, reads: 3, ...over });
const LINES = [line("l1", ["1", "2"]), line("l2", ["2", "3"], { reads: 1 }), line("l3", ["4", "3"]), line("l4", ["3", "5"]), line("l5", ["5", "2"], { certain: false, reads: 1 }), line("l6", ["4", "1"])];

/** The sketch read and drawn, as a read puts it on the plan, and the check's verdicts by the numbers each item runs through. */
const readAndChecked = (lines = LINES, verdict: (nums: string) => "drawn" | "not_drawn" | "unsure" = (n) => (n === "5,2" || n === "2,5" ? "not_drawn" : "drawn")): SurveyDocument => {
  const base: SurveyDocument = { ...emptyDocument(), codes: commonCodes(), sketch: { model: "claude-sonnet-5-5", readAt: "2026-11-28T10:00:00Z", files: ["s.jpg"], readings: [], unreadable: [], drawing: { lines, symbols: [], areas: [] } } };
  const drawn = applySketch(base, interpretDocument(base, POINTS)!).document;
  const items = checkItems(drawn, POINTS).map((it) => ({ key: it.key, points: it.points, verdict: it.kind === "lot" ? ("not_drawn" as const) : verdict(it.points.join(",")), note: "The right side runs 2 to 3." }));
  return { ...drawn, sketch: { ...drawn.sketch!, check: { model: "claude-sonnet-5-5", at: "2026-11-28T10:03:00Z", items, missing: [] } } };
};
const lotArea = (d: SurveyDocument) =>
  d.lots.map((l) => {
    const ps = l.points.map((id) => POINTS.find((p) => p.id === id)!);
    let s = 0;
    for (let i = 0; i < ps.length; i++) s += ps[i]!.e * ps[(i + 1) % ps.length]!.n - ps[(i + 1) % ps.length]!.e * ps[i]!.n;
    return Math.round(Math.abs(s / 2));
  });

describe("what the second reading leaves out", () => {
  it("is a line read once, with doubt, that the check doesn't find drawn, and the lot is drawn again without it", () => {
    const doc = readAndChecked();
    expect(lotArea(doc)).toEqual([220]);
    const second = withSecondReading(doc, POINTS, new Date("2026-11-28T10:04:00Z"));
    expect(second.leftOut.map((l) => l.line)).toEqual(["l5"]);
    expect(second.leftOut[0]).toMatchObject({ points: ["5", "2"], note: "The right side runs 2 to 3." });
    expect(lotArea(second.document)).toEqual([200]);
    // What it drew from the misread side is taken off; nothing confirmed is touched.
    expect(second.removed.some((k) => k.startsWith("lot:"))).toBe(true);
    expect(second.document.sketch?.leftOut?.map((l) => l.line)).toEqual(["l5"]);
  });

  it("never leaves out a line read twice or read with certainty, nor one the check found drawn or couldn't tell", () => {
    const twice = LINES.map((l) => (l.id === "l5" ? { ...l, reads: 2 } : l));
    const sure = LINES.map((l) => (l.id === "l5" ? { ...l, certain: true } : l));
    for (const lines of [twice, sure]) expect(withSecondReading(readAndChecked(lines), POINTS, new Date()).leftOut).toEqual([]);
    expect(withSecondReading(readAndChecked(LINES, () => "unsure"), POINTS, new Date()).leftOut).toEqual([]);
    expect(withSecondReading(readAndChecked(LINES, () => "drawn"), POINTS, new Date()).leftOut).toEqual([]);
  });

  it("never acts on a verdict about numbers the line no longer runs through, nor without a check", () => {
    const doc = readAndChecked();
    const moved = { ...doc, sketch: { ...doc.sketch!, check: { ...doc.sketch!.check!, items: doc.sketch!.check!.items.map((v) => (v.verdict === "not_drawn" && v.key.startsWith("feature:") ? { ...v, points: ["5", "3"] } : v)) } } };
    expect(linesToLeaveOut(moved, interpretDocument(moved, POINTS), new Date())).toEqual([]);
    const unchecked = { ...doc, sketch: { ...doc.sketch!, check: undefined } };
    expect(withSecondReading(unchecked, POINTS, new Date()).document).toBe(unchecked);
  });

  it("never leaves out a line the surveyor confirmed, kept through a new read", () => {
    const doc = readAndChecked();
    const id = interpretDocument(doc, POINTS)!.proposals.find((p) => p.kind === "line" && p.from.includes("l5"))!.id;
    const confirmed = { ...doc, provenance: { ...doc.provenance, [`feature:${id}`]: { source: "ai_photo" as const, reviewed: true } } };
    expect(withSecondReading(confirmed, POINTS, new Date()).leftOut).toEqual([]);
  });

  it("keeps the plan as it was when leaving the line out would lose the lot", () => {
    // Without l2 the misread side is the only right side: leaving it out would leave no lot.
    const doc = readAndChecked(LINES.filter((l) => l.id !== "l2"));
    const second = withSecondReading(doc, POINTS, new Date());
    expect(second.leftOut).toEqual([]);
    expect(second.document).toBe(doc);
  });
});

describe("a line left out, on the plan", () => {
  const left = withSecondReading(readAndChecked(), POINTS, new Date("2026-11-28T10:04:00Z")).document;
  const list = (d: SurveyDocument) => exceptionsFor(d, POINTS, buildPlan({ points: POINTS, document: d, crsId: "LOCAL", crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null }).findings);

  it("is said on a card with what the check said, to leave out or put back, holding approval until answered", () => {
    const card = list(left).confirm.find((e) => e.code === "SKETCH_LEFT_OUT")!;
    expect(card.title).toBe("Farbaek left out the line through 5, 2: the sketch was read with it once, with doubt, and an independent check of the sketch doesn't find it drawn.");
    expect(card.evidence).toBe("The check says: The right side runs 2 to 3.");
    expect(card.keep).toEqual({ key: "left:l5", kept: false });
    expect(card.leftOut).toEqual({ line: "l5" });
    // Agreed to: a note, still with the press to put it back.
    const agreed = { ...left, kept: [...left.kept, "left:l5"] };
    expect(list(agreed).confirm.some((e) => e.code === "SKETCH_LEFT_OUT")).toBe(false);
    expect(list(agreed).note.find((e) => e.code === "SKETCH_LEFT_OUT_KEPT")?.leftOut).toEqual({ line: "l5" });
  });

  it("is put back in a press: drawn as read again, and the lot redrawn round it", () => {
    const back = withLinePutBack({ ...left, kept: [...left.kept, "left:l5"] }, POINTS, "l5")!;
    expect(back.document.sketch?.leftOut).toEqual([]);
    expect(back.document.kept).not.toContain("left:l5");
    expect(lotArea(back.document)).toEqual([220]);
    expect(withLinePutBack(left, POINTS, "l9")).toBeNull();
  });
});
