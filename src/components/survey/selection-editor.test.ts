/** Choosing surveyed points by their numbers, and drawing a line through them (stage 253, ADR 0261). SYNTHETIC points only. */
import { describe, expect, it } from "vitest";
import { emptyDocument, type SurveyDocument } from "@/core/survey/document";
import type { SurveyPoint } from "@/core/survey/parcel";
import { MAX_LINES, cannotFinish, nextDrawing, pointsFromNumbers, type Drawing } from "./selection-editor";

const pt = (id: string, pointId: string): SurveyPoint => ({ id, pointId, e: 0, n: 0, z: null, code: null });
const POINTS = [pt("a", "1"), pt("b", "2"), pt("c", "3"), pt("d", "7"), pt("e", "7")];

describe("points by the numbers the surveyor types", () => {
  it("takes commas, semicolons or spaces, in order, each one surveyed point", () => {
    expect(pointsFromNumbers("1, 2 3", POINTS)).toEqual({ ids: ["a", "b", "c"] });
    expect(pointsFromNumbers(" 3,2,,1 ", POINTS)).toEqual({ ids: ["c", "b", "a"] });
    expect(pointsFromNumbers("1; 2;3", POINTS)).toEqual({ ids: ["a", "b", "c"] });
  });
  it("never invents a point", () => {
    expect(pointsFromNumbers("1, 9", POINTS)).toEqual({ problem: "There's no point 9 in the survey." });
  });
  it("never picks between two that share a number, unless the item already uses one of them", () => {
    expect(pointsFromNumbers("1, 7", POINTS)).toEqual({ problem: "More than one surveyed point is numbered 7, so the number alone can't say which. Renumber one in the survey files, or keep the corner that's there." });
    expect(pointsFromNumbers("1, 7", POINTS, ["a", "e"])).toEqual({ ids: ["a", "e"] });
  });
});

describe("drawing a line through surveyed points", () => {
  const start: Drawing = { points: [], layer: "WALLS", code: "MW", closed: false };
  const through = (...ids: string[]) => ids.reduce(nextDrawing, start);

  it("adds each tapped point in order, and the same point twice in a row once", () => {
    expect(through("a", "b", "b", "c").points).toEqual(["a", "b", "c"]);
  });
  it("closes the outline when the first point is tapped again after three or more", () => {
    const closed = through("a", "b", "c", "a");
    expect(closed.points).toEqual(["a", "b", "c"]);
    expect(closed.closed).toBe(true);
    // With only two points, the first again is the line's next point, not a close.
    expect(through("a", "b", "a")).toEqual({ ...start, points: ["a", "b", "a"] });
  });

  it("says why it can't be finished: a locked layer, or a full plan", () => {
    const doc: SurveyDocument = emptyDocument();
    expect(cannotFinish(start, doc)).toBeNull();
    doc.layers.WALLS = { visible: true, locked: true };
    expect(cannotFinish(start, doc)).toBe("Walls are locked: unlock them on the Layers tab, or draw this as something else.");
    expect(cannotFinish({ ...start, layer: "FENCES" }, doc)).toBeNull();
    doc.features = Array.from({ length: MAX_LINES }, (_, i) => ({ id: `f${i}`, layer: "FENCES" as const, code: "", closed: false, points: ["a", "b"] }));
    expect(cannotFinish({ ...start, layer: "FENCES" }, doc)).toBe(`The plan holds ${MAX_LINES} lines at most: remove one to draw another.`);
  });
});
