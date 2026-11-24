/**
 * Correcting a sketch's reading (stage 249, ADR 0257), on SYNTHETIC points: a 10 m square lot whose corner 4 was read as 7, a point
 * inside it. Corrected once, the line and the lot are redrawn; what the surveyor confirmed is never changed.
 */
import { describe, expect, it } from "vitest";
import { checkSketch, sketchFindings, type SketchReading, type SketchRecord } from "../autosurvey/sketch";
import { commonCodes } from "../codes";
import { crsById } from "../crs";
import { emptyDocument, type SurveyDocument } from "../document";
import type { SurveyPoint } from "../parcel";
import { applySketch } from "./apply";
import { correctedDrawing, correctedReadings, numberKey, redrawFromCorrection, type SketchCorrection } from "./correct";
import type { SketchDrawing, SketchLine } from "./drawing";
import { interpretSketch } from "./interpret";

const codes = commonCodes();
const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
const PTS = [at("1", 0, 0), at("2", 10, 0), at("3", 10, 10), at("4", 0, 10), at("7", 4, 6)];
let k = 0;
const line = (points: string[], file = "s.jpg"): SketchLine => ({ id: `l${++k}`, file, points, label: "MW", style: "double", closes: false, certain: true });
const MISREAD: SketchDrawing = { lines: [line(["1", "2", "3"]), line(["3", "7", "1"])], symbols: [], areas: [] };
const FIX: SketchCorrection = { file: "s.jpg", label: "7", to: "4", by: null, at: "2026-11-24T10:00:00Z" };
const interp = (d: SketchDrawing) => interpretSketch(d, PTS, codes);
const lotsOf = (doc: SurveyDocument) => doc.lots.map((l) => l.points.map((id) => PTS.find((p) => p.id === id)!.pointId).join("-"));

describe("a corrected reading", () => {
  it("replaces the number on its own photo only, in lines, symbols, areas and readings", () => {
    const d: SketchDrawing = { lines: [line(["3", "7", "1"]), line(["7", "2"], "t.jpg")], symbols: [{ id: "s1", file: "s.jpg", kind: "well", label: "", at: "7" }], areas: [{ id: "a1", file: "s.jpg", label: "Lot A", around: ["1", "2", "3", "7"] }] };
    const c = correctedDrawing(d, [FIX]);
    expect(c.lines.map((l) => l.points.join("-"))).toEqual(["3-4-1", "7-2"]);
    expect(c.symbols[0]!.at).toBe("4");
    expect(c.areas[0]!.around).toEqual(["1", "2", "3", "4"]);
    const r: SketchReading[] = [
      { id: "r1", file: "s.jpg", kind: "point", text: "7", from: "", to: "", near: "" },
      { id: "r2", file: "s.jpg", kind: "distance", text: "10.00", from: "3", to: "7", near: "" },
      { id: "r3", file: "t.jpg", kind: "point", text: "7", from: "", to: "", near: "" },
    ];
    expect(correctedReadings(r, [FIX]).map((x) => [x.text, x.to])).toEqual([["4", ""], ["10.00", "4"], ["7", ""]]);
    // The newest correction of a number wins.
    expect(correctedDrawing(MISREAD, [FIX, { ...FIX, to: "2" }]).lines[1]!.points).toEqual(["3", "2", "1"]);
  });

  it("redraws what the sketch drew and nobody confirmed: the wrong line and lot off, the right ones on", () => {
    const before = interp(MISREAD);
    const drawn = applySketch(emptyDocument(), before).document;
    const after = interp(correctedDrawing(MISREAD, [FIX]));
    const r = redrawFromCorrection(drawn, before, after);
    expect(r.removed.length).toBeGreaterThan(0);
    expect(r.kept).toEqual([]);
    expect(r.document.features.some((f) => f.points.includes(PTS[4]!.id))).toBe(false);
    expect(lotsOf(r.document)).toEqual([expect.stringMatching(/^(?=.*1)(?=.*2)(?=.*3)(?=.*4)[1-4-]+$/)]);
    const lot = r.document.lots[0]!;
    expect(r.document.provenance[`lot:${lot.id}`]).toEqual({ source: "ai_photo", reviewed: false });
  });

  it("never changes what the surveyor confirmed, and names it", () => {
    const before = interp(MISREAD);
    const drawn = applySketch(emptyDocument(), before).document;
    const confirmed: SurveyDocument = { ...drawn, provenance: Object.fromEntries(Object.entries(drawn.provenance).map(([key, v]) => [key, key.startsWith("lot:") ? { ...v, reviewed: true } : v])) };
    const r = redrawFromCorrection(confirmed, before, interp(correctedDrawing(MISREAD, [FIX])));
    expect(r.kept).toEqual([expect.stringMatching(/^lot:/)]);
    expect(lotsOf(r.document)).toEqual(lotsOf(confirmed));
  });

  it("leaves a plan the sketch didn't draw as it is", () => {
    const r = redrawFromCorrection(emptyDocument(), null, null);
    expect(r).toMatchObject({ removed: [], added: [], kept: [] });
  });
});

describe("faults a fresh review found (stage 249)", () => {
  it("never puts back what the surveyor took off: only what the correction changes goes on", () => {
    const before = interp(MISREAD);
    const drawn = applySketch(emptyDocument(), before).document;
    // The surveyor removed the line 1, 2, 3, which the correction doesn't touch.
    const gone = drawn.features.find((f) => f.points.length === 3 && f.points[1] === PTS[1]!.id)!;
    const removed: SurveyDocument = { ...drawn, features: drawn.features.filter((f) => f !== gone), provenance: Object.fromEntries(Object.entries(drawn.provenance).filter(([k]) => k !== `feature:${gone.id}`)) };
    const r = redrawFromCorrection(removed, before, interp(correctedDrawing(MISREAD, [FIX])));
    expect(r.document.features.some((f) => f.id === gone.id)).toBe(false);
    expect(r.added.some((k) => k === `feature:${gone.id}`)).toBe(false);
  });

  it("replaces the sketch's lot with the corrected one beside a lot drawn by hand", () => {
    const before = interp(MISREAD);
    const drawn = applySketch(emptyDocument(), before).document;
    const hand = { id: "lot-hand", label: "2", sup: "", points: [PTS[0]!.id, PTS[1]!.id, PTS[4]!.id], note: "" };
    const r = redrawFromCorrection({ ...drawn, lots: [...drawn.lots, hand] }, before, interp(correctedDrawing(MISREAD, [FIX])));
    expect(r.removed.filter((k) => k.startsWith("lot:"))).toHaveLength(1);
    expect(r.added.filter((k) => k.startsWith("lot:"))).toHaveLength(1);
    expect(r.document.lots.map((l) => l.id)).toContain("lot-hand");
    expect(r.document.lots).toHaveLength(2);
  });

  it("corrects two numbers swapped on a photo by correcting each, never one through the other", () => {
    const d: SketchDrawing = { lines: [line(["1", "4", "2"])], symbols: [], areas: [] };
    const swap: SketchCorrection[] = [FIX, { ...FIX, label: "4", to: "7" }];
    expect(correctedDrawing(d, swap).lines[0]!.points).toEqual(["1", "7", "2"]);
    expect(correctedDrawing({ lines: [line(["7", "4"])], symbols: [], areas: [] }, swap).lines[0]!.points).toEqual(["4", "7"]);
  });

  it("corrects a number however it's written, as the engine matches it: 7., 07 and 7 alike, but not A7", () => {
    const d: SketchDrawing = { lines: [line(["3", "07", "1"]), line(["7.", "A7"])], symbols: [], areas: [] };
    const c = correctedDrawing(d, [{ ...FIX, label: "7." }]);
    expect(c.lines.map((l) => l.points)).toEqual([["3", "4", "1"], ["4", "A7"]]);
    expect(numberKey(" 007; ")).toBe("7");
    expect(numberKey("a1")).not.toBe(numberKey("A1"));
  });

  it("makes the plan's own checks read the corrected number, keeping the answer's key", () => {
    const sketch: SketchRecord = {
      model: "claude-sonnet-5-5",
      readAt: "2026-11-24T10:00:00Z",
      files: ["s.jpg"],
      readings: [{ id: "r2", file: "s.jpg", kind: "distance", text: "10.00", from: "3", to: "7", near: "" }],
      unreadable: [],
    };
    const local = crsById("LOCAL")!;
    expect(checkSketch(sketch, PTS, local)[0]).toMatchObject({ status: "differs" });
    const fixed = checkSketch({ ...sketch, corrections: [FIX] }, PTS, local)[0]!;
    expect(fixed).toMatchObject({ status: "agrees", corrected: true, reading: { id: "r2", to: "4" } });
    expect(sketchFindings({ ...sketch, corrections: [FIX] }, PTS, local, new Set()).some((f) => f.code === "SKETCH_DIFFERS")).toBe(false);
  });
});
