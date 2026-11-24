/**
 * Where each number is written on a sketch (stage 247, ADR 0255), on SYNTHETIC points: a 30 m by 20 m grid of twelve surveyed points,
 * "photographed" turned upside down, scaled and with a hand's unevenness, so the fit has to undo all three.
 */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import type { SurveyPoint } from "../parcel";
import type { SketchLine } from "./drawing";
import { sketchEvidence } from "./findings";
import { interpretSketch } from "./interpret";
import { misplacedNumbers, type PlacedNumber } from "./placement";

const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
// Grid points 1 to 12: four across (10 m apart), three up; turned 30° and moved to a 500 000 / 600 000 grid, as real coordinates are.
const T = (30 * Math.PI) / 180;
const GRID = Array.from({ length: 12 }, (_, k) => {
  const [u, v] = [(k % 4) * 10, Math.floor(k / 4) * 10];
  return at(String(k + 1), 500_000 + u * Math.cos(T) - v * Math.sin(T), 600_000 + u * Math.sin(T) + v * Math.cos(T));
});
const local = (p: SurveyPoint) => {
  const [de, dn] = [p.e - 500_000, p.n - 600_000];
  return { u: de * Math.cos(T) + dn * Math.sin(T), v: -de * Math.sin(T) + dn * Math.cos(T) };
};
/** Where the sketch has a point: upside down (the book turned), 25 photo units a metre, with up to `wobble` of unevenness. */
const photo = (p: SurveyPoint, wobble = 15) => {
  const { u, v } = local(p);
  const k = Number(p.pointId);
  return { x: 850 - 25 * u + (((k * 37) % 7) - 3) * (wobble / 3), y: 250 + 25 * v + (((k * 53) % 7) - 3) * (wobble / 3) };
};
const placedAll = (wobble = 15, file = "s.jpg"): PlacedNumber[] => GRID.map((p) => ({ label: p.pointId, file, ...photo(p, wobble) }));
const byId = (id: string) => GRID.find((p) => p.pointId === id)!;

describe("a number written where another point would be", () => {
  it("is found, with the point written there, through a turned and uneven sketch", () => {
    // The reader didn't read 8; a number it read as 4 sits where 8 would be.
    const placed = placedAll().filter((p) => p.label !== "8").map((p) => (p.label === "4" ? { ...p, ...photo(byId("8")) } : p));
    const m = misplacedNumbers(placed, GRID);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ label: "4", pointId: "4", likely: "8", likelyWritten: false });
    expect(m[0]!.off).toBeGreaterThan(200);
  });

  it("says only that a number is out of place when the other point's own number is written there too", () => {
    const placed = placedAll().map((p) => (p.label === "4" ? { ...p, ...photo(byId("8")) } : p));
    expect(misplacedNumbers(placed, GRID)).toEqual([expect.objectContaining({ label: "4", likely: "8", likelyWritten: true })]);
  });

  it("says nothing when every number is where its point would be, give or take a hand's unevenness", () => {
    expect(misplacedNumbers(placedAll(60), GRID)).toEqual([]);
  });

  it("suggests the point for a number the survey doesn't have, written where an unread point is", () => {
    const placed = [...placedAll().filter((p) => p.label !== "7"), { label: "99", file: "s.jpg", ...photo(byId("7")) }];
    expect(misplacedNumbers(placed, GRID)).toEqual([expect.objectContaining({ label: "99", pointId: null, likely: "7" })]);
    // Beside a point whose own number is written, it's only a number the survey doesn't have, asked about as that.
    expect(misplacedNumbers([...placedAll(), { label: "99", file: "s.jpg", ...photo(byId("7")) }], GRID)).toEqual([]);
  });

  it("needs six numbers on a photo, not in a line, and fits each photo on its own", () => {
    expect(misplacedNumbers(placedAll().slice(0, 5).map((p, i) => (i === 0 ? { ...p, ...photo(byId("5")) } : p)), GRID)).toEqual([]);
    const row = GRID.slice(0, 4).concat(GRID.slice(0, 4).map((p, i) => at(String(20 + i), p.e + 0.001, p.n)));
    expect(misplacedNumbers(row.map((p) => ({ label: p.pointId, file: "s.jpg", x: 500, y: 100 + Number(p.pointId) })), row)).toEqual([]);
    // The same twelve numbers on a second photo, at other places, don't disturb the first photo's fit.
    const second = placedAll(15, "t.jpg").map((p) => ({ ...p, x: 1000 - p.x }));
    expect(misplacedNumbers([...placedAll(), ...second], GRID)).toEqual([]);
  });

  it("doesn't let a label written twice on one photo vote for either place", () => {
    const placed = [...placedAll(), { label: "6", file: "s.jpg", ...photo(byId("11")) }];
    expect(misplacedNumbers(placed, GRID).every((m) => m.label === "6")).toBe(true);
  });
});

describe("the engine asks, and the lot's card says so", () => {
  let k = 0;
  const line = (points: string[]): SketchLine => ({ id: `l${++k}`, file: "s.jpg", points, label: "MW", style: "double", closes: false, certain: true });
  const lines = [line(["1", "2", "3", "4"]), line(["4", "8", "12"]), line(["12", "11", "10", "9"]), line(["9", "5", "1"])];

  it("asks about the corner written where another point would be, and puts it on the lot's card", () => {
    const placed = placedAll().filter((p) => p.label !== "8").map((p) => (p.label === "4" ? { ...p, ...photo(byId("8")) } : p));
    const r = interpretSketch({ lines, symbols: [], areas: [] }, GRID, commonCodes(), { placed });
    const q = r.questions.find((x) => x.text.startsWith("The number read as 4"));
    expect(q?.text).toBe("The number read as 4 is written on the sketch where point 8 would be, going by where the other numbers are written.");
    const lot = r.proposals.find((p) => p.kind === "lot")!;
    expect(q?.item).toBe(lot.id);
    expect(lot.evidence.join(" ")).toContain("Its corner 4 may be misread: it's written on the sketch where point 8 would be.");
    expect(lot.level).toBe("check");
  });

  it("offers the correction in one press only when the other point's number isn't written too (stage 249)", () => {
    const ids = (ps: PlacedNumber[]) => ps.map((p) => ({ ...p, id: `r${p.label}` }));
    const placed = ids(placedAll().filter((p) => p.label !== "8").map((p) => (p.label === "4" ? { ...p, ...photo(byId("8")) } : p)));
    const r = interpretSketch({ lines, symbols: [], areas: [] }, GRID, commonCodes(), { placed });
    const lot = r.proposals.find((p) => p.kind === "lot")!;
    const q = r.questions.find((x) => x.text.startsWith("The number read as 4"))!;
    expect(q.suggest).toEqual({ file: "s.jpg", reading: "r4", label: "4", to: "8" });
    expect(q.evidence[0]).toContain("if it's 8, use 8 for it in one press");
    expect(sketchEvidence(r, `lot:${lot.id}`)?.fixes).toEqual([{ file: "s.jpg", reading: "r4", label: "4", to: "8" }]);
    // Not when two surveyed points are numbered 8 (the press could only be refused), nor when the reading isn't known.
    const twin = { ...byId("8"), id: "00000000-0000-4000-8000-000000000888", e: byId("8").e + 300 };
    const t2 = interpretSketch({ lines, symbols: [], areas: [] }, [...GRID, twin], commonCodes(), { placed });
    expect(t2.questions.find((x) => x.text.startsWith("The number read as 4"))?.suggest).toBeUndefined();
    const noIds = placed.map((p) => ({ label: p.label, file: p.file, x: p.x, y: p.y }));
    expect(interpretSketch({ lines, symbols: [], areas: [] }, GRID, commonCodes(), { placed: noIds }).questions.find((x) => x.text.startsWith("The number read as 4"))?.suggest).toBeUndefined();
    // With 8 written at its own place as well, the 4 there isn't plainly a misread 8: it's asked about, with nothing offered.
    const both = placedAll().map((p) => (p.label === "4" ? { ...p, ...photo(byId("8")) } : p));
    const s = interpretSketch({ lines, symbols: [], areas: [] }, GRID, commonCodes(), { placed: both });
    expect(s.questions.find((x) => x.text.startsWith("The number read as 4"))?.suggest).toBeUndefined();
    expect(sketchEvidence(s, `lot:${s.proposals.find((p) => p.kind === "lot")!.id}`)?.fixes).toEqual([]);
  });

  it("changes nothing that's drawn: the same proposals with or without the places", () => {
    const placed = placedAll().map((p) => (p.label === "4" ? { ...p, ...photo(byId("8")) } : p));
    const strip = (r: ReturnType<typeof interpretSketch>) => r.proposals.map((p) => ({ ...p, evidence: [], level: "strong" }));
    expect(strip(interpretSketch({ lines, symbols: [], areas: [] }, GRID, commonCodes(), { placed }))).toEqual(strip(interpretSketch({ lines, symbols: [], areas: [] }, GRID, commonCodes())));
  });
});

describe("faults a fresh review found (stage 247)", () => {
  it("never says a number two surveyed points share is out of place, or suggests a number as itself", () => {
    const twin = at("10", byId("10").e + 40, byId("10").n + 40);
    expect(misplacedNumbers(placedAll(), [...GRID, { ...twin, id: "00000000-0000-4000-8000-000000000999" }])).toEqual([]);
  });

  it("tells a swap: each of two numbers written at the other's place may be the other", () => {
    const placed = placedAll().map((p) => (p.label === "4" ? { ...p, ...photo(byId("8")) } : p.label === "8" ? { ...p, ...photo(byId("4")) } : p));
    const m = misplacedNumbers(placed, GRID);
    expect(m.map((x) => [x.label, x.likely, x.likelyWritten]).sort()).toEqual([
      ["4", "8", false],
      ["8", "4", false],
    ]);
  });

  it("isn't steered or switched off by a far point written on the photo", () => {
    for (const far of [500, 3000]) {
      const station = at("100", byId("1").e + far, byId("1").n - far);
      const placed = [...placedAll().filter((p) => p.label !== "8").map((p) => (p.label === "4" ? { ...p, ...photo(byId("8")) } : p)), { label: "100", file: "s.jpg", x: 120, y: 940 }];
      expect(misplacedNumbers(placed, [...GRID, station]).find((x) => x.label === "4")).toMatchObject({ likely: "8" });
    }
  });

  it("asks once per number, however many photos raise it, and not at all about a number nothing uses", () => {
    const moved = (file: string) => placedAll(15, file).filter((p) => p.label !== "8").map((p) => (p.label === "4" ? { ...p, ...photo(byId("8")) } : p));
    let k = 0;
    const line = (points: string[]): SketchLine => ({ id: `m${++k}`, file: "s.jpg", points, label: "MW", style: "double", closes: false, certain: true });
    const lines = [line(["1", "2", "3", "4"]), line(["4", "8", "12"]), line(["12", "11", "10", "9"]), line(["9", "5", "1"])];
    const asked = (ls: SketchLine[]) => interpretSketch({ lines: ls, symbols: [], areas: [] }, GRID, commonCodes(), { placed: [...moved("s.jpg"), ...moved("t.jpg")] }).questions.filter((q) => q.text.startsWith("The number read as"));
    expect(asked(lines)).toHaveLength(1);
    expect(asked([line(["5", "6", "7"])])).toEqual([]);
  });

  it("puts a crossing on the card of a lot written as an area", () => {
    let k = 0;
    const line = (points: string[]): SketchLine => ({ id: `n${++k}`, file: "s.jpg", points, label: "", style: "single", closes: false, certain: false });
    const r = interpretSketch({ lines: [line(["1", "12"]), line(["4", "9"])], symbols: [], areas: [{ id: "a1", file: "s.jpg", label: "Lot A", around: ["1", "4", "12", "9"] }] }, GRID, commonCodes());
    const lot = r.proposals.find((p) => p.kind === "lot");
    expect(lot?.evidence.join(" ")).toContain("which cross each other where no number is");
  });
});
