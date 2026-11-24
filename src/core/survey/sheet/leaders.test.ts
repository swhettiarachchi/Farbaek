/**
 * Leader lines for legs too crowded to letter against (stage 251, ADR 0259), on SYNTHETIC rows of narrow lots: a leg's bearing and
 * distance stand a little way out, joined to the leg's middle by a thin line with a dot, only when nothing against the leg is clear.
 */
import { describe, expect, it } from "vitest";
import { crsById } from "../crs";
import type { SurveyDocument } from "../document";
import { SAMPLE_POINTS, sampleDocument } from "../fixtures";
import { computeLots } from "../lots";
import type { SurveyPoint } from "../parcel";
import { composeSheet, overlappingLabels } from "./compose";
import { LEADER_DOT } from "./draw";
import type { SceneCircle, SceneItem, ScenePath, SceneText } from "./scene";
import { SRI_LANKA_CADASTRAL_V1 } from "./template";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** A row of `count` lots `width` m wide and `depth` m deep, numbered along the front (1, 2, ...) and the back (101, 102, ...). */
const row = (count: number, width: number, depth: number): SurveyPoint[] =>
  Array.from({ length: count + 1 }, (_, k) => [
    { id: id(k + 1), pointId: String(k + 1), e: 500_000 + k * (width + 0.003), n: 600_000 + k * 0.011, z: null, code: "CP" },
    { id: id(k + 101), pointId: String(k + 101), e: 500_000 + k * (width - 0.003), n: 600_000 + depth + k * 0.009, z: null, code: "St" },
  ]).flat();
const lotsOf = (count: number, template: "panel" | "classic" = "panel"): SurveyDocument => {
  const doc = sampleDocument();
  doc.roads = [];
  doc.adjoining = [];
  doc.features = [];
  doc.lots = Array.from({ length: count }, (_, k) => ({ id: `lot-${k + 1}`, label: String(k + 1), sup: "", points: [id(k + 1), id(k + 2), id(k + 102), id(k + 101)], note: "" }));
  doc.settings = { ...doc.settings, template, scale: 1000, paper: "A4", faceDimensions: true, overleaf: true };
  return doc;
};
const compose = (doc: SurveyDocument, points: readonly SurveyPoint[]) =>
  composeSheet({ template: SRI_LANKA_CADASTRAL_V1, document: doc, points, lots: computeLots(points, doc.lots), crs: crsById("EPSG:5235"), crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null });
const front = (doc: SurveyDocument, points: readonly SurveyPoint[]) => compose(doc, points).pages[0]!.items;
const dots = (items: SceneItem[]) => items.filter((i): i is SceneCircle => i.kind === "circle" && i.layer === "DIMENSIONS");
const leaderOf = (items: SceneItem[], entity: string) => items.find((i): i is ScenePath => i.kind === "path" && i.layer === "DIMENSIONS" && i.entity === entity);
const EIGHT = row(8, 8, 25);

describe("leader lines for crowded legs", () => {
  it.each(["panel", "classic"] as const)("letters a row of 8 m frontages at 1:1000 clear on the %s layout, the crowded ones with leaders", (template) => {
    // Clear of every other label, point, leader and leader's dot.
    const items = front(lotsOf(8, template), EIGHT);
    expect(overlappingLabels(items)).toEqual([]);
    const marks = dots(items);
    expect(marks.length).toBeGreaterThan(0);
    for (const d of marks) {
      expect(d.r).toBe(LEADER_DOT);
      // Each leader runs from its dot, on a lot's boundary, to its own words.
      const line = leaderOf(items, d.entity!)!;
      expect(line.points[0]).toEqual([d.cx, d.cy]);
      const words = items.filter((i): i is SceneText => i.kind === "text" && i.entity === d.entity);
      expect(words).toHaveLength(1);
      const [ex, ey] = line.points[1]!;
      expect(Math.hypot(ex - words[0]!.x, ey - words[0]!.y)).toBeLessThan(20);
    }
  });

  it("counts covering a leader or its dot as an overlap, and never a leader reaching its own words", () => {
    const entity = "leg:lot-1:0";
    const words: SceneText = { kind: "text", x: 50, y: 40, text: "089°55′16″  8.00", size: 2, weight: "regular", font: "sans", anchor: "middle", rotate: 0, color: "ink", layer: "DIMENSIONS", entity };
    const leader: ScenePath = { kind: "path", points: [[50, 50], [50, 40.6]], closed: false, width: 0.18, color: "ink", layer: "DIMENSIONS", entity };
    const dot: SceneCircle = { kind: "circle", cx: 50, cy: 50, r: LEADER_DOT, width: 0.18, color: "ink", fill: "ink", layer: "DIMENSIONS", entity };
    const drawn = [words, leader, dot];
    expect(overlappingLabels(drawn)).toEqual([]);
    const other = (x: number, y: number): SceneText => ({ ...words, x, y, text: "109", layer: "POINTS", entity: "pt:109" });
    expect(overlappingLabels([...drawn, other(50, 45.5)])).toEqual([["109", "a leader"]]);
    expect(overlappingLabels([...drawn, other(50, 51.5)])).toContainEqual(["109", "a leader's dot"]);
  });

  it("never draws a leader where the words fit against the leg: the sample sheet is unchanged", () => {
    const doc = sampleDocument();
    doc.settings = { ...doc.settings, faceDimensions: true };
    expect(dots(front(doc, SAMPLE_POINTS))).toEqual([]);
  });

  it("puts the dot at the leg's middle on the page", () => {
    const items = front(lotsOf(8), EIGHT);
    const legs = items.filter((i): i is ScenePath => i.kind === "path" && i.layer === "BOUNDARY");
    for (const d of dots(items)) {
      const onLeg = legs.some((l) => {
        const [[x1, y1], [x2, y2]] = [l.points[0]!, l.points[l.points.length - 1]!];
        return Math.hypot((x1 + x2) / 2 - d.cx, (y1 + y2) / 2 - d.cy) < 1e-6;
      });
      expect(onLeg).toBe(true);
    }
  });

  it("keeps a dragged leader label where the surveyor put it, with its leader following the words and its dot on the leg", () => {
    const doc = lotsOf(8);
    const before = front(doc, EIGHT);
    const d = dots(before)[0]!;
    const words = before.find((i): i is SceneText => i.kind === "text" && i.entity === d.entity)!;
    const end = leaderOf(before, d.entity!)!.points[1]!;
    const dragged = { ...doc, labelOffsets: { [d.entity!]: { dx: 3, dy: -2, slot: words.slot! } } };
    const after = front(dragged, EIGHT);
    const moved = after.find((i): i is SceneText => i.kind === "text" && i.entity === d.entity)!;
    expect([moved.x, moved.y]).toEqual([words.x + 3, words.y - 2]);
    const line = leaderOf(after, d.entity!)!;
    expect(line.points[0]).toEqual([d.cx, d.cy]);
    expect(line.points[1]).toEqual([end[0] + 3, end[1] - 2]);
  });
});
