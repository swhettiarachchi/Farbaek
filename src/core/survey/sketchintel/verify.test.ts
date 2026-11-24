/**
 * An independent check of the plan against the sketch (stage 263, ADR 0271), on SYNTHETIC points: a 20 m square lot 1-2-3-4, a wall 5-6
 * and a house 7-8-9 with a constructed corner. No model is called: the answers are written here as a model would give them.
 */
import { describe, expect, it } from "vitest";
import { cleanSketchText, sketchRecordSchema } from "../autosurvey/sketch";
import { commonCodes } from "../codes";
import { cornerId } from "../construct";
import { emptyDocument, surveyDocumentSchema, type SurveyDocument } from "../document";
import { hasInvisible } from "../import/delimited";
import type { SurveyPoint } from "../parcel";
import { buildPlan } from "../view";
import { acceptCheck, checkItems, sketchCheckSchema, type SketchCheck } from "./verify";

const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
const E0 = 500_000;
const N0 = 600_000;
const POINTS = [at("1", E0, N0), at("2", E0 + 20, N0), at("3", E0 + 20, N0 + 20), at("4", E0, N0 + 20), at("5", E0 + 5, N0), at("6", E0 + 5, N0 + 20), at("7", E0 + 0.15, N0 + 10), at("8", E0 + 3, N0 + 12.5)];
const id = (n: string) => POINTS.find((p) => p.pointId === n)!.id;
const corner = { id: cornerId(id("8"), id("7")), kind: "square" as const, from: id("7"), to: id("8"), ref: [id("4"), id("1")] as [string, string] };
const record = (check?: SketchCheck) => sketchRecordSchema.parse({ model: "claude-sonnet-5-5", readAt: "2026-11-24T10:00:00.000Z", files: ["s.jpg"], readings: [], unreadable: [], ...(check ? { check } : {}) });
const base = (check?: SketchCheck): SurveyDocument =>
  surveyDocumentSchema.parse({
    ...emptyDocument(),
    codes: commonCodes(),
    lots: [{ id: "lotX", label: "X", sup: "", points: ["1", "2", "3", "4"].map(id), note: "" }],
    features: [
      { id: "wall", layer: "WALLS", code: "MW", closed: false, points: [id("5"), id("6")] },
      { id: "box", layer: "BUILDINGS", code: "", closed: false, points: [id("8"), corner.id, id("7")] },
    ],
    constructed: [corner],
    provenance: { "feature:wall": { source: "ai_photo", reviewed: false }, "feature:box": { source: "ai_photo", reviewed: false } },
    sketch: record(check),
  });
const clean = cleanSketchText;

describe("what the check is asked about", () => {
  it("is every lot, line and outline by its point numbers, a constructed corner as the word corner", () => {
    expect(checkItems(base(), POINTS)).toEqual([
      { key: "lot:lotX", kind: "lot", points: ["1", "2", "3", "4"], label: "Lot X" },
      { key: "feature:wall", kind: "line", points: ["5", "6"], label: "MW" },
      { key: "feature:box", kind: "line", points: ["8", "corner", "7"], label: "" },
    ]);
  });
});

describe("the check's answer", () => {
  const items = checkItems(base(), POINTS);
  it("is kept only for items asked about, once each, and missing lines on photos that were sent", () => {
    const kept = acceptCheck(
      {
        items: [
          { item: 0, verdict: "drawn", note: "anything" },
          { item: 1, verdict: "not_drawn", note: "  The sketch draws 5 to 3, not 5 to 6. " },
          { item: 1, verdict: "drawn", note: "" },
          { item: 7, verdict: "drawn", note: "" },
        ],
        missing: [
          { image: 0, points: ["6", "3"], label: "MW" },
          { image: 3, points: ["1", "2"], label: "" },
          { image: 0, points: ["9"], label: "" },
          { image: 0, points: ["2", "3"], label: "x​" },
        ],
      },
      items,
      ["s.jpg"],
      "claude-sonnet-5-5",
      new Date("2026-11-24T11:00:00Z"),
      clean,
      hasInvisible,
    );
    expect(kept.items).toEqual([
      { key: "lot:lotX", points: ["1", "2", "3", "4"], verdict: "drawn", note: "" },
      { key: "feature:wall", points: ["5", "6"], verdict: "not_drawn", note: "The sketch draws 5 to 3, not 5 to 6." },
    ]);
    expect(kept.missing).toEqual([{ file: "s.jpg", points: ["6", "3"], label: "MW" }]);
    expect(sketchCheckSchema.safeParse(kept).success).toBe(true);
  });
});

describe("the check's findings", () => {
  const check: SketchCheck = {
    model: "claude-sonnet-5-5",
    at: "2026-11-24T11:00:00.000Z",
    items: [
      { key: "lot:lotX", points: ["1", "2", "3", "4"], verdict: "drawn", note: "" },
      { key: "feature:wall", points: ["5", "6"], verdict: "not_drawn", note: "The sketch draws 5 to 3." },
      { key: "feature:box", points: ["8", "corner", "7"], verdict: "drawn", note: "" },
    ],
    missing: [
      { file: "s.jpg", points: ["6", "3"], label: "MW" },
      { file: "s.jpg", points: ["2", "3"], label: "" },
      { file: "s.jpg", points: ["6", "6a"], label: "" },
    ],
  };
  const plan = (d: SurveyDocument) => buildPlan({ points: POINTS, document: d, crsId: "LOCAL", crsConfirmation: "Confirmed for this test", surveyor: null, approval: null }).findings;

  it("doubt an item it didn't find and list each line the plan doesn't draw, holding approval until each is looked at", () => {
    const f = plan(base(check));
    const doubt = f.find((x) => x.code === "SKETCH_CHECK_DOUBT");
    expect(doubt).toMatchObject({ severity: "professional_review", blocks: ["approval"], target: { kind: "feature", id: "wall" }, detail: "The check says: The sketch draws 5 to 3.", keep: { key: "check:i1", kept: false } });
    expect(doubt!.message).toBe("The MW line through 5, 6: an independent check of the sketch doesn't find it drawn so.");
    // 2 to 3 is the lot's side, already on the plan; 6a isn't a surveyed point, so it can't be drawn: only 6 to 3 is missing.
    const missing = f.filter((x) => x.code === "SKETCH_CHECK_MISSING");
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ message: "An independent check of the sketch found a line the plan doesn't draw: 6 to 3 (MW).", keep: { key: "check:m0", kept: false }, blocks: ["approval"] });
    expect(f.find((x) => x.code === "SKETCH_CHECKED")!.message).toBe("The plan was checked against the sketch: 2 of 3 items the check was asked about are drawn so there.");
  });

  it("keep a doubt for an item the surveyor changed but not its points, drop it once its points change, and keep the plan as drawn on the answer", () => {
    // Confirming or editing an item's words doesn't answer the check: after "check again", a corrected item's doubt still shows.
    const confirmed = base(check);
    confirmed.provenance["feature:wall"] = { source: "ai_photo", reviewed: true };
    expect(plan(confirmed).some((x) => x.code === "SKETCH_CHECK_DOUBT")).toBe(true);
    const changed = base(check);
    changed.features[0]!.points = [id("5"), id("3")];
    expect(plan(changed).some((x) => x.code === "SKETCH_CHECK_DOUBT")).toBe(false);
    const answered = { ...base(check), kept: ["check:i1", "check:m0"] };
    const f = plan(answered);
    expect(f.some((x) => x.code === "SKETCH_CHECK_DOUBT" || x.code === "SKETCH_CHECK_MISSING")).toBe(false);
    expect(f.filter((x) => x.code === "SKETCH_CHECK_KEPT").map((x) => [x.severity, x.blocks, x.keep])).toEqual([
      ["information", [], { key: "check:i1", kept: true }],
      ["information", [], { key: "check:m0", kept: true }],
    ]);
    const drawn = base(check);
    drawn.features.push({ id: "w2", layer: "WALLS", code: "MW", closed: false, points: [id("3"), id("6")] });
    expect(plan(drawn).some((x) => x.code === "SKETCH_CHECK_MISSING")).toBe(false);
    // A plan never checked says nothing about a check.
    expect(plan(base()).some((x) => x.code.startsWith("SKETCH_CHECK"))).toBe(false);
  });
});

describe("after review", () => {
  it("asks about a road's edges, so they never come back as missing", () => {
    const d = { ...base(), roads: [{ id: "rd", name: "Lane", edgeA: [id("1"), id("2")], edgeB: [id("5"), id("6")], width: "none" as const, start: "", end: "" }] };
    const items = checkItems(surveyDocumentSchema.parse(d), POINTS);
    expect(items.filter((i) => i.key.startsWith("road:"))).toEqual([
      { key: "road:rd#a", kind: "line", points: ["1", "2"], label: "Lane" },
      { key: "road:rd#b", kind: "line", points: ["5", "6"], label: "Lane" },
    ]);
  });

  it("keeps a verdict for a line of more than 60 points, and a note written over two lines", () => {
    const long = Array.from({ length: 70 }, (_, k) => at(String(100 + k), E0 + k * 0.2, N0 + 30));
    const pts = [...POINTS, ...long];
    const d = surveyDocumentSchema.parse({ ...base(), features: [{ id: "long", layer: "WALLS", code: "MW", closed: false, points: long.map((p) => p.id) }], constructed: undefined, provenance: {} });
    const items = checkItems(d, pts);
    const kept = acceptCheck({ items: [{ item: 1, verdict: "unsure", note: "The end\nis off the photo" }], missing: [] }, items, ["s.jpg"], "m", new Date("2026-11-24T11:00:00Z"), clean, hasInvisible);
    expect(kept.items[0]).toMatchObject({ key: "feature:long", verdict: "unsure", note: "The end is off the photo" });
    expect(kept.items[0]!.points).toHaveLength(70);
    expect(sketchCheckSchema.safeParse(kept).success).toBe(true);
  });
});
