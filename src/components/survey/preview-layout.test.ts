/** The start screen's drawing of the points (stage 293). Every value is SYNTHETIC. */
import { describe, expect, it } from "vitest";
import { LABELLED_POINTS, barWords, layoutPreview } from "./preview-layout";

const site = [
  { id: "100", e: 1000, n: 1000 },
  { id: "1", e: 1008.315, n: 1005.712 },
  { id: "2", e: 994.163, n: 996.413 },
  { id: "3", e: 995.432, n: 995.15 },
];

describe("drawing the points on the start screen", () => {
  it("draws north up at one scale both ways, inside the box", () => {
    const l = layoutPreview(site, new Set(["100"]), 360)!;
    const at = (id: string) => l.dots.find((d) => d.id === id)!;
    // North is up: the northernmost point is highest; east is right.
    expect(at("1").y).toBeLessThan(at("100").y);
    expect(at("1").x).toBeGreaterThan(at("100").x);
    // One scale: the screen distance between two points is the ground distance times the same factor in x and y.
    const k = (at("1").x - at("2").x) / (1008.315 - 994.163);
    expect((at("2").y - at("1").y) / (1005.712 - 996.413)).toBeCloseTo(k, 9);
    for (const d of l.dots) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThanOrEqual(360);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeLessThanOrEqual(l.height);
    }
    expect(at("100").station).toBe(true);
    expect(l.across).toBeCloseTo(14.152, 9);
    expect(l.along).toBeCloseTo(10.562, 9);
  });

  it("never lets two numbers cover each other, and counts those left off", () => {
    // Points 0.11 m apart, as two marks a wall's thickness apart are: both can't carry a number at this size.
    const crowded = [...site, { id: "4", e: 995.538, n: 995.185 }, { id: "5", e: 995.54, n: 995.19 }];
    const l = layoutPreview(crowded, new Set(), 340)!;
    const w = (id: string) => id.length * 12 * 0.62 + 2;
    const boxes = l.labels.map((t) => {
      const x0 = t.anchor === "start" ? t.x : t.anchor === "end" ? t.x - w(t.id) : t.x - w(t.id) / 2;
      return { x0, x1: x0 + w(t.id), y0: t.y - 12, y1: t.y };
    });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(boxes[i]!.x0 < boxes[j]!.x1 && boxes[j]!.x0 < boxes[i]!.x1 && boxes[i]!.y0 < boxes[j]!.y1 && boxes[j]!.y0 < boxes[i]!.y1).toBe(false);
    expect(l.labels.length + l.hidden).toBe(crowded.length);
  });

  it("puts a station's number on first", () => {
    const pair = [
      { id: "7", e: 0, n: 0 },
      { id: "100", e: 0.01, n: 0 },
    ];
    const l = layoutPreview(pair, new Set(["100"]), 200)!;
    expect(l.labels.map((t) => t.id)).toContain("100");
  });

  it("draws dots without numbers past the limit, a round scale bar, and nothing for no points", () => {
    const many = Array.from({ length: LABELLED_POINTS + 1 }, (_, i) => ({ id: String(i), e: i % 30, n: Math.floor(i / 30) }));
    const l = layoutPreview(many, new Set(), 600)!;
    expect(l.labels).toEqual([]);
    expect(l.hidden).toBe(many.length);
    expect([0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100]).toContain(l.bar!.metres);
    expect(l.bar!.pixels).toBeLessThanOrEqual(150);
    expect(layoutPreview([], new Set(), 600)).toBeNull();
    expect(layoutPreview(site, new Set(), 0)).toBeNull();
  });

  it("never puts a number over the north arrow or the scale bar", () => {
    // A point at each corner, where the arrow (north-east) and the bar (south-west) stand.
    const corners = [
      { id: "88", e: 100, n: 100 },
      { id: "77", e: 0, n: 0 },
      { id: "5", e: 50, n: 50 },
    ];
    const l = layoutPreview(corners, new Set(), 320)!;
    const w = (id: string) => id.length * 12 * 0.62 + 2;
    const box = (t: (typeof l.labels)[number]) => {
      const x0 = t.anchor === "start" ? t.x : t.anchor === "end" ? t.x - w(t.id) : t.x - w(t.id) / 2;
      return { x0, x1: x0 + w(t.id), y0: t.y - 12, y1: t.y };
    };
    const arrow = { x0: l.north.x - 7, x1: l.north.x + 7, y0: l.north.y - 2, y1: l.north.y + 30 };
    const bar = { x0: l.bar!.x, x1: l.bar!.x + l.bar!.pixels + 40, y0: l.bar!.y - 12, y1: l.bar!.y + 8 };
    const hit = (a: { x0: number; x1: number; y0: number; y1: number }, b: typeof a) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    for (const t of l.labels) {
      expect(hit(box(t), arrow), `${t.id} on the arrow`).toBe(false);
      expect(hit(box(t), bar), `${t.id} on the bar`).toBe(false);
    }
  });

  it("gives a tiny survey a bar in centimetres, and none when nothing fits or the points share one place", () => {
    // Two marks 10 cm apart: a 2 cm bar, within a quarter of the drawing.
    const tiny = layoutPreview([{ id: "1", e: 0, n: 0 }, { id: "2", e: 0.1, n: 0 }], new Set(), 300)!;
    expect(tiny.bar).not.toBeNull();
    expect(tiny.bar!.pixels).toBeLessThanOrEqual(75);
    expect(barWords(tiny.bar!.metres)).toBe("2 cm");
    // 1 cm apart fills the drawing: no round length fits a quarter of it, so no bar rather than one running off the edge.
    expect(layoutPreview([{ id: "1", e: 0, n: 0 }, { id: "2", e: 0.01, n: 0 }], new Set(), 300)!.bar).toBeNull();
    expect(layoutPreview([{ id: "1", e: 5, n: 5 }, { id: "2", e: 5, n: 5 }], new Set(), 300)!.bar).toBeNull();
    expect(barWords(10)).toBe("10 m");
    expect(barWords(0.05)).toBe("5 cm");
  });

  it("draws one point, or points on one line, without dividing by nothing", () => {
    const one = layoutPreview([{ id: "1", e: 5, n: 5 }], new Set(), 300)!;
    expect(one.dots[0]).toMatchObject({ x: 150 });
    const line = layoutPreview([{ id: "1", e: 0, n: 0 }, { id: "2", e: 10, n: 0 }], new Set(), 300)!;
    expect(line.dots.every((d) => Number.isFinite(d.x) && Number.isFinite(d.y))).toBe(true);
  });
});
