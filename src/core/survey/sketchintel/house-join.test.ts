/**
 * A house whose walls the read left one short stroke short of closing (stage 303, ADR 0309). SYNTHETIC: a 10 by 20 m lot, its left side
 * through 8; a house in the bottom left behind walls 5 to 6 to 7, where 7 stops 0.30 m short of 8 on the lot's side; "house" written
 * inside. Without the stroke from 7 to 8, nothing closes round the label; with it, the house is its room.
 */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import { emptyDocument, type SurveyDocument } from "../document";
import { exceptionsFor } from "../exceptions";
import type { SurveyPoint } from "../parcel";
import { buildPlan } from "../view";
import { applySketch } from "./apply";
import type { SketchDrawing, SketchLine } from "./drawing";
import { interpretDocument, looksLikeAnotherJob, strangeNumbers } from "./findings";
import { withJoin, withoutJoin } from "./joins";
import { interpretSketch } from "./interpret";
import { sketchTooSmall } from "../autosurvey/sketch";

const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e: 500_000 + e, n: 600_000 + n, z: null, code: null });
const XY: Record<string, [number, number]> = { 1: [0, 0], 2: [10, 0], 3: [10, 20], 4: [0, 20], 8: [0, 8], 5: [6, 0], 6: [6, 8], 7: [0.3, 8], 9: [2, 2], 10: [3, 3] };
const POINTS = Object.entries(XY).map(([id, [e, n]]) => at(id, e, n));
// The photo: north up, 25 px a metre, so where each number is written follows the ground.
const photo = (e: number, n: number) => ({ x: 100 + 25 * e, y: 700 - 25 * n });
const placed = Object.entries(XY).map(([label, [e, n]]) => ({ id: `p${label}`, file: "s.jpg", kind: "point" as const, text: label, from: "", to: "", near: "", photo: photo(e, n) }));
const label = { id: "rh", file: "s.jpg", kind: "feature" as const, text: "house", from: "", to: "", near: "", photo: photo(3, 4) };
const line = (id: string, points: string[], over: Partial<SketchLine> = {}): SketchLine => ({ id, file: "s.jpg", points, label: "", style: "single", closes: false, certain: true, reads: 2, ...over });
const BOUNDARY = line("l1", ["1", "2", "3", "4", "8"], { label: "MW", style: "double", closes: true });
const WALLS = line("l2", ["5", "6", "7"], { style: "hatched" });

const docWith = (lines: SketchLine[]): SurveyDocument => {
  const drawing: SketchDrawing = { lines, symbols: [], areas: [{ id: "a1", file: "s.jpg", label: "house", around: [] }] };
  const base: SurveyDocument = { ...emptyDocument(), codes: commonCodes(), sketch: { model: "claude-sonnet-5-5", readAt: "2026-11-28T10:00:00Z", files: ["s.jpg"], readings: [...placed, label], unreadable: [], drawing } };
  return applySketch(base, interpretDocument(base, POINTS)!).document;
};
const buildings = (d: SurveyDocument) => d.features.filter((f) => f.closed && f.layer === "BUILDINGS").map((f) => f.points.map((id) => POINTS.find((p) => p.id === id)!.pointId).join("-"));

describe("a house one short stroke from closing", () => {
  it("isn't drawn round the rest of the lot, and the one join that closes it is offered", () => {
    const doc = docWith([BOUNDARY, WALLS]);
    expect(buildings(doc)).toEqual([]);
    const offer = interpretDocument(doc, POINTS)!.questions.find((q) => q.join)!;
    expect(offer.join).toMatchObject({ pairs: [{ from: "7", to: "8" }], outline: ["1", "5", "6", "7", "8"] });
    expect(offer.join!.pairs[0]!.metres).toBeCloseTo(0.3, 5);
    expect(offer.text).toContain("Joined from 7 to 8, 0.30 m apart, they close round 1, 5, 6, 7 and 8 (48.00 m²). Is that wall drawn on your sketch?");
    const card = exceptionsFor(doc, POINTS, buildPlan({ points: POINTS, document: doc, crsId: "LOCAL", crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null }).findings).confirm.find((e) => e.code === "SKETCH_JOIN")!;
    expect(card.join).toEqual({ file: "s.jpg", pairs: [{ from: "7", to: "8" }], made: false });
    expect(card.keep).toEqual({ key: "join:7|8", kept: false });
  });

  it("is drawn round its room once joined, as the surveyor's word, and taken off again in a press", () => {
    const doc = docWith([BOUNDARY, WALLS]);
    const joined = withJoin(doc, POINTS, [{ from: "7", to: "8" }], "11111111-1111-4111-8111-111111111111", new Date("2026-11-28T11:00:00Z"))!;
    expect(joined.document.sketch?.joins).toEqual([{ file: "s.jpg", from: "7", to: "8", by: "11111111-1111-4111-8111-111111111111", at: "2026-11-28T11:00:00.000Z" }]);
    expect(buildings(joined.document)).toEqual(["1-5-6-7-8"]);
    expect(joined.document.provenance[`feature:${joined.document.features.find((f) => f.closed && f.layer === "BUILDINGS")!.id}`]).toEqual({ source: "ai_photo", reviewed: false });
    // An outline an earlier version of the reader drew inside the house, which the sketch as read now doesn't draw, goes with the redraw
    // while it waits; one the surveyor confirmed stays (stage 304).
    const id = (n: string) => POINTS.find((p) => p.pointId === n)!.id;
    const stale = { ...doc, features: [...doc.features, { id: "sk-b-old", code: "P", layer: "BUILDINGS" as const, points: [id("5"), id("6"), id("7")], closed: true }, { id: "sk-b-mine", code: "P", layer: "BUILDINGS" as const, points: [id("9"), id("10"), id("6")], closed: true }], provenance: { ...doc.provenance, "feature:sk-b-old": { source: "ai_photo" as const, reviewed: false }, "feature:sk-b-mine": { source: "ai_photo" as const, reviewed: true } } };
    const cleaned = withJoin(stale, POINTS, [{ from: "7", to: "8" }], null, new Date("2026-11-28T11:00:00Z"))!;
    expect(cleaned.removed).toContain("feature:sk-b-old");
    expect(cleaned.document.features.map((f) => f.id)).not.toContain("sk-b-old");
    expect(cleaned.document.features.map((f) => f.id)).toContain("sk-b-mine");
    expect(cleaned.kept).not.toContain("feature:sk-b-mine");
    // Only an offered join is made.
    expect(withJoin(doc, POINTS, [{ from: "6", to: "8" }], null, new Date())).toBeNull();
    expect(withJoin(doc, POINTS, [{ from: "7", to: "8" }, { from: "6", to: "8" }], null, new Date())).toBeNull();
    const apart = withoutJoin(joined.document, POINTS, "7", "8")!;
    expect(buildings(apart.document)).toEqual([]);
    expect(apart.document.sketch?.joins).toEqual([]);
  });

  it("never draws a room that holds something else the sketch draws, and never offers a join longer than a metre", () => {
    // The stroke drawn, but a line from 9 to 10 inside the room: not a house's room alone.
    const inside = interpretSketch({ lines: [BOUNDARY, line("l2", ["5", "6", "7", "8"], { style: "hatched" }), line("l3", ["9", "10"])], symbols: [], areas: [{ id: "a1", file: "s.jpg", label: "house", around: [] }] }, POINTS, commonCodes(), { placed: placed.map((p) => ({ label: p.text, file: p.file, ...p.photo })), labels: [{ text: "house", file: "s.jpg", ...photo(3, 4) }] });
    expect(inside.proposals.some((p) => p.kind === "building")).toBe(false);
    expect(inside.questions.some((q) => q.text.includes("also holds 9 and 10"))).toBe(true);
    // 7 stopping 1.5 m short: nothing offered.
    const far = { ...XY, 7: [1.5, 8] as [number, number] };
    const farPoints = Object.entries(far).map(([id, [e, n]]) => at(id, e, n));
    const r = interpretSketch({ lines: [BOUNDARY, WALLS], symbols: [], areas: [{ id: "a1", file: "s.jpg", label: "house", around: [] }] }, farPoints, commonCodes(), { placed: Object.entries(far).map(([l, [e, n]]) => ({ label: l, file: "s.jpg", ...photo(e, n) })), labels: [{ text: "house", file: "s.jpg", ...photo(3, 4) }] });
    expect(r.questions.some((q) => q.join)).toBe(false);
  });

  it("offers two joins in one press when no one stroke closes the room (stage 304)", () => {
    // The walls start 0.40 m above 5 on the lot's bottom side, past its end, and stop 0.30 m short of 8: two strokes missed.
    const xy: Record<string, [number, number]> = { ...XY, 11: [6, 0.4] };
    const pts = Object.entries(xy).map(([id, [e, n]]) => at(id, e, n));
    const seen = Object.entries(xy).map(([l, [e, n]]) => ({ id: `p${l}`, file: "s.jpg", kind: "point" as const, text: l, from: "", to: "", near: "", photo: photo(e, n) }));
    const drawing: SketchDrawing = { lines: [line("l1", ["1", "5", "2", "3", "4", "8"], { label: "MW", style: "double", closes: true }), line("l2", ["11", "6", "7"], { style: "hatched" })], symbols: [], areas: [{ id: "a1", file: "s.jpg", label: "house", around: [] }] };
    const base: SurveyDocument = { ...emptyDocument(), codes: commonCodes(), sketch: { model: "claude-opus-5-5", readAt: "2026-11-28T10:00:00Z", files: ["s.jpg"], readings: [...seen, label], unreadable: [], drawing } };
    const doc = applySketch(base, interpretDocument(base, pts)!).document;
    const named = (d: SurveyDocument) => d.features.filter((f) => f.closed && f.layer === "BUILDINGS").map((f) => f.points.map((id) => pts.find((p) => p.id === id)!.pointId).join("-"));
    expect(named(doc)).toEqual([]);
    const offers = interpretDocument(doc, pts)!.questions.filter((q) => q.join);
    expect(offers).toHaveLength(1);
    expect(offers[0]!.join!.pairs.map((p) => `${p.from}-${p.to}`)).toEqual(["7-8", "11-5"]);
    expect(offers[0]!.text).toContain("Joined from 7 to 8 (0.30 m apart) and from 11 to 5 (0.40 m apart), they close round");
    expect(offers[0]!.text).toContain("(48.00 m²). Are those walls drawn on your sketch?");
    const card = exceptionsFor(doc, pts, buildPlan({ points: pts, document: doc, crsId: "LOCAL", crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null }).findings).confirm.find((e) => e.code === "SKETCH_JOIN")!;
    expect(card.keep).toEqual({ key: "join:7|8+11|5", kept: false });
    expect(card.join?.pairs).toEqual([{ from: "7", to: "8" }, { from: "11", to: "5" }]);
    // One of the two alone isn't what's offered.
    expect(withJoin(doc, pts, [{ from: "7", to: "8" }], null, new Date())).toBeNull();
    const joined = withJoin(doc, pts, [{ from: "7", to: "8" }, { from: "11", to: "5" }], null, new Date("2026-11-28T11:00:00Z"))!;
    expect(joined.document.sketch?.joins?.map((j) => `${j.from}-${j.to}`)).toEqual(["7-8", "11-5"]);
    expect(named(joined.document)).toHaveLength(1);
    expect(interpretDocument(joined.document, pts)!.questions.some((q) => q.join)).toBe(false);
    // Each is taken off on its own.
    expect(withoutJoin(joined.document, pts, "11", "5")!.document.sketch?.joins?.map((j) => `${j.from}-${j.to}`)).toEqual(["7-8"]);
  });
});

describe("a sketch that can't be read for this job", () => {
  it("is too small to read below 700 by 1,000 pixels, saying so with what to do", () => {
    expect(sketchTooSmall(509, 729, "Capture0.PNG")).toBe("Capture0.PNG is too small to read: 509 by 729 pixels, so its numbers would be guessed. Take a photo of the sketch with the camera, flat and close, and add that; a screenshot, or a photo sent through a chat app, is too small.");
    expect(sketchTooSmall(960, 1280, "a")).toBeNull();
    expect(sketchTooSmall(3000, 4000, "a")).toBeNull();
    expect(sketchTooSmall(1280, 650, "a")).not.toBeNull();
    // A wide phone photo, shrunk to its long side before it was sent, was larger than that: never refused.
    expect(sketchTooSmall(1568, 672, "a")).toBeNull();
  });

  it("looks like another job's when many of its numbers aren't surveyed points", () => {
    const other = interpretSketch({ lines: [line("l1", ["52", "56", "54", "53", "42"]), line("l2", ["1", "2"])], symbols: [], areas: [] }, POINTS, commonCodes());
    expect(strangeNumbers(other)).toEqual({ strange: ["52", "56", "54", "53", "42"], total: 7 });
    expect(looksLikeAnotherJob(strangeNumbers(other))).toBe(true);
    expect(looksLikeAnotherJob(strangeNumbers(interpretSketch({ lines: [BOUNDARY, WALLS], symbols: [], areas: [] }, POINTS, commonCodes())))).toBe(false);
  });
});
