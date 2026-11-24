/**
 * A building's word given only as writing, a new read replacing what the last one drew and nobody confirmed, and the reader's Sinhala
 * words (stage 256, ADR 0264). SYNTHETIC data only.
 */
import { describe, expect, it } from "vitest";
import { SKETCH_READ_PROMPT } from "@/server/ai/sketch-reader";
import type { SketchReading } from "../autosurvey/sketch";
import { commonCodes } from "../codes";
import { emptyDocument, surveyDocumentSchema, type SurveyDocument } from "../document";
import { withoutWaitingSketchItems } from "./apply";
import type { SketchDrawing } from "./drawing";
import { withBuildingWords } from "./findings";

const reading = (id: string, kind: SketchReading["kind"], text: string, photo?: { x: number; y: number }): SketchReading => ({ id, file: "s.jpg", kind, text, from: "", to: "", near: "", ...(photo ? { photo } : {}) });
const drawing = (areas: SketchDrawing["areas"] = []): SketchDrawing => ({ lines: [], symbols: [], areas });

describe("a building's word given only as writing", () => {
  it("is taken as that area's label, with no corners, so its outline is found from where it's written", () => {
    const d = withBuildingWords(drawing(), [reading("r1", "feature", "ගෙදර", { x: 520, y: 890 }), reading("r2", "feature", "MW", { x: 10, y: 10 })], commonCodes());
    expect(d.areas).toEqual([{ id: "a1", file: "s.jpg", label: "ගෙදර", around: [] }]);
  });

  it("isn't taken twice, beside an area the reader gave, without a place on the photo, or for writing that isn't a building", () => {
    const given = drawing([{ id: "a3", file: "s.jpg", label: "house", around: ["1", "2"] }]);
    const d = withBuildingWords(given, [reading("r1", "feature", "house", { x: 1, y: 1 }), reading("r2", "note", "ගෙදර"), reading("r3", "adjoining", "Land claimed by the house owner", { x: 5, y: 5 }), reading("r4", "point", "12", { x: 3, y: 3 })], commonCodes());
    expect(d).toBe(given);
    const twice = withBuildingWords(drawing(), [reading("r1", "feature", "P", { x: 1, y: 1 }), reading("r2", "note", "P", { x: 2, y: 2 })], commonCodes());
    expect(twice.areas.map((a) => a.label)).toEqual(["P"]);
  });
});

describe("a new read of the sketch", () => {
  const P = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const doc = (): SurveyDocument => ({
    ...emptyDocument(),
    codes: commonCodes(),
    lots: [{ id: "sk-lot-a", label: "", sup: "", points: [P(1), P(2), P(3)], note: "" }, { id: "mine", label: "B", sup: "", points: [P(4), P(5), P(6)], note: "" }],
    features: [
      { id: "sk-l-wait", layer: "WALLS", code: "MW", closed: false, points: [P(1), P(2)] },
      { id: "sk-l-checked", layer: "WALLS", code: "MW", closed: false, points: [P(2), P(3)] },
      { id: "drawn-by-hand", layer: "FENCES", code: "", closed: false, points: [P(3), P(4)] },
    ],
    symbols: [{ id: "sk-s-well", code: "Well", point: P(7) }],
    adjoining: [],
    labelOffsets: { "feature:sk-l-wait": { dx: 1, dy: 1 }, "lot-extent:sk-lot-a": { dx: 2, dy: 2 }, "feature:drawn-by-hand": { dx: 3, dy: 3 } },
    provenance: {
      "lot:sk-lot-a": { source: "ai_photo", reviewed: false },
      "feature:sk-l-wait": { source: "ai_photo", reviewed: false },
      "feature:sk-l-checked": { source: "ai_photo", reviewed: true },
      "symbol:sk-s-well": { source: "ai_photo", reviewed: false },
    },
  });

  it("replaces what the last read drew and nobody confirmed, and keeps everything the surveyor confirmed or drew", () => {
    const d = withoutWaitingSketchItems(doc());
    expect(surveyDocumentSchema.safeParse(d).success).toBe(true);
    expect(d.lots.map((l) => l.id)).toEqual(["mine"]);
    expect(d.features.map((f) => f.id)).toEqual(["sk-l-checked", "drawn-by-hand"]);
    // The symbols field goes with its last symbol, as it was before the first.
    expect("symbols" in d).toBe(false);
    expect(Object.keys(d.provenance).sort()).toEqual(["feature:sk-l-checked"]);
    expect(Object.keys(d.labelOffsets)).toEqual(["feature:drawn-by-hand"]);
  });

  it("keeps a lot the surveyor has named, noted or given neighbours, though not yet confirmed", () => {
    const named = doc();
    named.lots[0]!.label = "X";
    expect(withoutWaitingSketchItems(named).lots.map((l) => l.id)).toEqual(["sk-lot-a", "mine"]);
    const neighbours = doc();
    neighbours.adjoining = [{ id: "adj1", text: "Land of the sample neighbour", lot: "sk-lot-a", from: P(1), to: P(2) }];
    const kept = withoutWaitingSketchItems(neighbours);
    expect(kept.lots.map((l) => l.id)).toEqual(["sk-lot-a", "mine"]);
    expect(kept.adjoining).toHaveLength(1);
  });

  it("changes nothing on a plan the surveyor has confirmed throughout", () => {
    const confirmed = doc();
    for (const k of Object.keys(confirmed.provenance)) confirmed.provenance[k] = { ...confirmed.provenance[k]!, reviewed: true };
    expect(withoutWaitingSketchItems(confirmed)).toEqual(confirmed);
  });
});

describe("the reader's words", () => {
  it("names the Sinhala words sketches use, and asks for a best reading with doubt rather than none", () => {
    for (const w of ["ගෙදර", "ළිඳ", "ගේට්ටුව", "පාර", "කාණුව", "වැට", "ඉඩම"]) expect(SKETCH_READ_PROMPT).toContain(w);
    expect(SKETCH_READ_PROMPT).toContain("rather than left as unreadable");
    expect(SKETCH_READ_PROMPT).toContain("is an area with that word");
  });
});
