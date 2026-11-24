/**
 * Label placement (stage 233, ADR 0242): the solver on small hand-made cases with known answers, then whole sheets of the SYNTHETIC
 * sample compared with the first pass, each label at its first free place.
 */
import { describe, expect, it } from "vitest";
import { crsById } from "../crs";
import { SAMPLE_POINTS, sampleDocument } from "../fixtures";
import { computeLots } from "../lots";
import type { SurveyPoint } from "../parcel";
import { composeSheet, overlappingLabels } from "./compose";
import { Placer, solveLabels, type Quad } from "./labels";
import { toPage } from "./scene";
import { SRI_LANKA_CADASTRAL_V1 } from "./template";

const box = (x0: number, y0: number, x1: number, y1: number): Quad => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

describe("the label solver", () => {
  it("moves the label that took another's only clear place, so both are clear", () => {
    const p = new Placer();
    // B's second place covers a line, so its only clear place is where A went first.
    p.segment([10, -1], [10, 2]);
    expect(p.choose("A", [[box(0, 0, 2, 1)], [box(4, 0, 6, 1)]])).toBe(0);
    expect(p.choose("B", [[box(1, 0, 3, 1)], [box(9, 0, 11, 1)]])).toBe(0);
    const s = solveLabels(p)!;
    expect(s.plan).toEqual([
      { key: "A", index: 1 },
      { key: "B", index: 0 },
    ]);
    expect([s.meetingBefore, s.meetingAfter]).toEqual([1, 0]);
    expect(s.after).toBeLessThan(s.before);
  });

  it("tries two labels together when neither can clear the other alone", () => {
    const p = new Placer();
    // A's places both meet B's first; B's places both meet A's first. Only A second with B second is clear.
    p.choose("A", [[box(0, 0, 2, 1)], [box(2.5, 0, 4.5, 1)]]);
    p.choose("B", [[box(1, 0, 3, 1)], [box(0.5, 0, 1.5, 1)]]);
    const s = solveLabels(p)!;
    expect(s.plan.map((x) => x.index)).toEqual([1, 1]);
    expect(s.meetingAfter).toBe(0);
  });

  it("brings a label back from a dear place, such as a leg's leader, once the label it made way for has moved", () => {
    const p = new Placer();
    // A stands clear at its dear second place (8, as a leader does). B covers A's first place, and C, which can't move, covers B.
    // B moves to its clear second place; then A's first place is clear, and A goes back to it.
    p.requests.push(
      { key: "A", candidates: [[box(0, 0, 10, 2)], [box(0, 20, 10, 22)]], admissible: [true, true], chosen: 1, pinned: false, base: [0, 8] },
      { key: "B", candidates: [[box(5, 0, 15, 2)], [box(30, 0, 40, 2)]], admissible: [true, true], chosen: 0, pinned: false },
      { key: "C", candidates: [[box(12, 0, 20, 2)]], admissible: [true], chosen: 0, pinned: true },
    );
    const s = solveLabels(p)!;
    expect(s.plan.map((x) => x.index)).toEqual([0, 1, 0]);
    expect(s.meetingAfter).toBe(0);
  });

  it("takes a place another label holds when that label has somewhere clear to go, which no single move or pair finds", () => {
    const p = new Placer();
    // A's first place meets D, which can't move; A's second is where B stands, and B has a clear second place.
    p.choose("A", [[box(0, 0, 4, 1)], [box(10, 0, 14, 1)]]);
    p.choose("B", [[box(12, 0, 16, 1)], [box(30, 0, 34, 1)]]);
    p.choose("D", [[box(2, 0, 6, 1)]]);
    const s = solveLabels(p)!;
    expect(s.plan.map((x) => x.index)).toEqual([1, 1, 0]);
    expect([s.meetingBefore, s.meetingAfter]).toEqual([1, 0]);
  });

  it("never moves a label the surveyor placed, never chooses a place that isn't allowed, and keeps out of the bounds' edge", () => {
    const pinned = new Placer();
    pinned.choose("A", [[box(0, 0, 2, 1)], [box(4, 0, 6, 1)]], { pinned: true });
    pinned.choose("B", [[box(1, 0, 3, 1)]]);
    // A can't move and B has one place: nothing to improve.
    expect(solveLabels(pinned)).toBeNull();

    const allowed = new Placer();
    allowed.choose("A", [[box(0, 0, 2, 1)], [box(4, 0, 6, 1)]], { admissible: [true, false] });
    allowed.choose("B", [[box(1, 0, 3, 1)], [box(1, 0, 3, 1)]]);
    const s = solveLabels(allowed);
    // A's clear place isn't allowed (outside its lot, say), so A stays; B has nowhere clear either.
    expect(s?.plan[0]?.index ?? 0).toBe(0);

    const bounded = new Placer(null, [0, 0, 10, 10]);
    // The first place runs past the bounds: the second, inside, is chosen.
    bounded.choose("A", [[box(9, 1, 12, 2)], [box(5, 1, 8, 2)]]);
    expect(solveLabels(bounded)!.plan[0]!.index).toBe(1);
  });

  it("leaves a sheet with no conflicts alone, and gives the same answer every time", () => {
    const clear = new Placer();
    clear.choose("A", [[box(0, 0, 1, 1)], [box(5, 5, 6, 6)]]);
    clear.choose("B", [[box(2, 0, 3, 1)], [box(7, 7, 8, 8)]]);
    expect(solveLabels(clear)).toBeNull();
    const make = () => {
      const p = new Placer();
      for (let i = 0; i < 30; i++) p.choose(`L${i}`, [0, 1, 2, 3].map((k) => [box(i * 0.7, k * 1.2, i * 0.7 + 2, k * 1.2 + 1)]));
      return solveLabels(p);
    };
    expect(make()).toEqual(make());
  });

  it("replays a solved plan on the second pass, and falls back to the first free place if the label isn't the one planned", () => {
    const p = new Placer([{ key: "A", index: 1 }]);
    expect(p.choose("A", [[box(0, 0, 1, 1)], [box(5, 5, 6, 6)]])).toBe(1);
    const q = new Placer([{ key: "other", index: 1 }]);
    expect(q.choose("A", [[box(0, 0, 1, 1)], [box(5, 5, 6, 6)]])).toBe(0);
  });
});

describe("labels on the sample's sheet (synthetic)", () => {
  const SLD99 = crsById("EPSG:5235");
  const input = (scale: number, points: readonly SurveyPoint[] = SAMPLE_POINTS) => {
    const doc = sampleDocument();
    doc.settings = { ...doc.settings, scale, paper: "A4" };
    return { template: SRI_LANKA_CADASTRAL_V1, document: doc, points, lots: computeLots(points, doc.lots), crs: SLD99, crsConfirmation: "Confirmed by Test Person on 2026-11-15", surveyor: null, approval: null };
  };
  const front = (s: ReturnType<typeof composeSheet>) => s.pages[0]!.items;

  it("never leaves more labels overlapping than the first pass, and fewer once the sheet is crowded", () => {
    const counts = [500, 1000, 2000, 2500].map((scale) => {
      const greedy = overlappingLabels(front(composeSheet(input(scale), "greedy"))).length;
      const solved = overlappingLabels(front(composeSheet(input(scale)))).length;
      expect(solved).toBeLessThanOrEqual(greedy);
      return { scale, greedy, solved };
    });
    expect(counts.some((c) => c.solved < c.greedy)).toBe(true);
    console.info(`Overlapping label pairs on the sample's sheet, first pass and solved: ${counts.map((c) => `1:${c.scale} ${c.greedy} to ${c.solved}`).join(", ")}`);
  });

  it("clears more of a crowded sub division: a row of narrow lots with short legs", () => {
    // SYNTHETIC: eight lots 8 m wide and 25 m deep in a row, sharing their side legs, near SLD99's centre, with every leg's bearing
    // and distance on the face (the surveyor's choice; otherwise they go in the schedule overleaf).
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const pts: SurveyPoint[] = [];
    for (let k = 0; k <= 8; k++) {
      pts.push({ id: id(k + 1), pointId: String(k + 1), e: 500_000 + k * 8.003, n: 600_000 + k * 0.011, z: null, code: "CP" });
      pts.push({ id: id(k + 101), pointId: String(k + 101), e: 500_000 + k * 7.997, n: 600_025 + k * 0.009, z: null, code: "St" });
    }
    const doc = sampleDocument();
    doc.roads = [];
    doc.adjoining = [];
    doc.features = [];
    doc.lots = Array.from({ length: 8 }, (_, k) => ({ id: `lot-${k + 1}`, label: String(k + 1), sup: "", points: [id(k + 1), id(k + 2), id(k + 102), id(k + 101)], note: "" }));
    const counts = [250, 500, 1000].map((scale) => {
      const d = { ...doc, settings: { ...doc.settings, scale, paper: "A4" as const, faceDimensions: true } };
      const inp = { template: SRI_LANKA_CADASTRAL_V1, document: d, points: pts, lots: computeLots(pts, d.lots), crs: SLD99, crsConfirmation: "Confirmed by Test Person on 2026-11-15", surveyor: null, approval: null };
      return { scale, greedy: overlappingLabels(front(composeSheet(inp, "greedy"))).length, solved: overlappingLabels(front(composeSheet(inp))).length };
    });
    for (const c of counts) expect(c.solved).toBeLessThanOrEqual(c.greedy);
    expect(counts.some((c) => c.solved < c.greedy)).toBe(true);
    console.info(`Overlapping label pairs on a row of eight narrow lots, first pass and solved: ${counts.map((c) => `1:${c.scale} ${c.greedy} to ${c.solved}`).join(", ")}`);
  });

  it("places a sub division of sixty lots with their dimensions on the face with few overlaps, never more than the first pass", () => {
    // SYNTHETIC: six rows of ten lots, 10 m by 20 m, every corner a concrete post, at 1:500 on A3.
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const pts: SurveyPoint[] = [];
    for (let r = 0; r <= 6; r++) for (let c = 0; c <= 10; c++) pts.push({ id: id(r * 100 + c + 1), pointId: String(r * 100 + c + 1), e: 500_000 + c * 10.002 + r * 0.003, n: 600_000 + r * 20.004 + c * 0.002, z: null, code: "CP" });
    const doc = sampleDocument();
    doc.roads = [];
    doc.adjoining = [];
    doc.features = [];
    doc.lots = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 10; c++) doc.lots.push({ id: `l${r}-${c}`, label: String(r * 10 + c + 1), sup: "", points: [id(r * 100 + c + 1), id(r * 100 + c + 2), id((r + 1) * 100 + c + 2), id((r + 1) * 100 + c + 1)], note: "" });
    doc.settings = { ...doc.settings, scale: 500, paper: "A3", faceDimensions: true };
    const inp = { template: SRI_LANKA_CADASTRAL_V1, document: doc, points: pts, lots: computeLots(pts, doc.lots), crs: SLD99, crsConfirmation: "Confirmed by Test Person on 2026-11-15", surveyor: null, approval: null };
    const greedy = overlappingLabels(front(composeSheet(inp, "greedy"))).length;
    const solved = overlappingLabels(front(composeSheet(inp))).length;
    // Corner numbers and marks registered line by line leave the first pass few overlaps; the solve never adds any.
    expect(solved).toBeLessThanOrEqual(greedy);
    expect(solved).toBeLessThanOrEqual(12);
    console.info(`Overlapping label pairs on sixty lots at 1:500, first pass and solved: ${greedy} to ${solved}`);
  }, 60_000);

  it("keeps a label exactly where the surveyor drops it, measured from the place it was drawn at, whatever the solver did", () => {
    for (const scale of [1000, 2000, 2500]) {
      const base = input(scale);
      const sheet = composeSheet(base);
      // Every movable label drawn at a place the solver could have chosen.
      const movable = [...new Map(front(sheet).flatMap((i) => (i.kind === "text" && i.entity && i.slot !== undefined ? [[i.entity, i] as const] : []))).values()];
      expect(movable.length).toBeGreaterThan(5);
      for (const item of movable) {
        if (item.kind !== "text") continue;
        const doc = { ...base.document, labelOffsets: { ...base.document.labelOffsets, [item.entity!]: { dx: 0.5, dy: -0.25, slot: item.slot } } };
        const after = front(composeSheet({ ...base, document: doc })).find((i) => i.kind === "text" && i.entity === item.entity && i.text === item.text);
        expect(after?.kind === "text" ? [after.x - item.x, after.y - item.y] : null, `${item.entity} at 1:${scale}`).toEqual([expect.closeTo(0.5, 9), expect.closeTo(-0.25, 9)]);
      }
    }
  });

  it("places an older offset, saved without its place, from the place chosen without it, so the drag itself never moves the base", () => {
    const base = input(500);
    const plain = composeSheet(base, "greedy");
    const well = front(plain).find((i) => i.kind === "text" && i.entity?.startsWith("mark:") && i.text === "Well");
    expect(well?.kind).toBe("text");
    if (well?.kind !== "text") return;
    for (const [dx, dy] of [[-4, 0], [2, 2], [0, 6]] as const) {
      const doc = { ...base.document, labelOffsets: { [well.entity!]: { dx, dy } } };
      const moved = front(composeSheet({ ...base, document: doc })).find((i) => i.kind === "text" && i.entity === well.entity);
      expect(moved?.kind === "text" ? [moved.x - well.x, moved.y - well.y] : null).toEqual([expect.closeTo(dx, 9), expect.closeTo(dy, 9)]);
    }
  });

  it("moves only text: every line, point and symbol is drawn exactly where the first pass drew it", () => {
    for (const scale of [500, 2000]) {
      const shapes = (s: ReturnType<typeof composeSheet>) => JSON.stringify(front(s).filter((i) => i.kind !== "text" && !(i.kind === "path" && i.layer === "ADJOINING")));
      expect(shapes(composeSheet(input(scale)))).toBe(shapes(composeSheet(input(scale), "greedy")));
    }
  });

  it("keeps each lot's label inside its own lot, at every scale", () => {
    const inside = (x: number, y: number, ring: [number, number][]) => {
      let c = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!;
        const [xj, yj] = ring[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    for (const scale of [500, 1000, 2000]) {
      const sheet = composeSheet(input(scale));
      const lots = computeLots(SAMPLE_POINTS, sampleDocument().lots);
      for (const r of lots.lots) {
        const ring = r.parcel!.vertices.map((v) => toPage(sheet.viewport!, v.e, v.n));
        const label = front(sheet).find((i) => i.kind === "text" && i.entity === `lot:${r.lot.id}`);
        expect(label?.kind).toBe("text");
        if (label?.kind === "text") expect(inside(label.x, label.y - label.size * 0.3, ring)).toBe(true);
      }
    }
  });
});
