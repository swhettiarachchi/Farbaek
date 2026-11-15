/** Reading a stated extent: hand-worked answers from the unit definitions (1 P = 25.29285264 m², 40 P = 1 R, 4 R = 1 A). */
import { describe, expect, it } from "vitest";
import { readStatedExtent } from "./extent";

const P = 25.29285264;
const perches = (t: string) => {
  const r = readStatedExtent(t);
  return r === null ? null : Math.round((r.m2 / P) * 1e6) / 1e6;
};

describe("stated extents as deeds and plans write them", () => {
  it("reads acres, roods and perches in the usual forms, numbers first or letters first", () => {
    for (const t of ["0 A. 2 R. 04.60 P.", "0A 2R 4.6P", "A0-R2-P4.60", "0 acres 2 roods 4.6 perches", "2R. 04.60P.", "A. 0 R. 2 P. 04.60", "A: 0 R: 2 P: 4.6", "0.21398 Hectares ( 0 A. 2 R. 04.60 P. )"]) {
      expect(perches(t), t).toBe(84.6);
      expect(readStatedExtent(t)!.as, t).toBe("arp");
    }
    expect(perches("A. 1 R. 0 P. 10")).toBe(170);
    expect(perches("Acres 1 Roods 2 Perches 10")).toBe(250);
    expect(perches("1 Ac. 2 R. 10 P.")).toBe(250);
    expect(perches("1 Acre, 2 Roods and 10 Perches")).toBe(250);
    expect(perches("1 A. 2 R. & 10 P.")).toBe(250);
    expect(perches("0A 1R 10 1/2P")).toBe(50.5);
    expect(perches("0A. 0R. 10½P.")).toBe(10.5);
  });

  it("reads hectares, acres, perches and square metres", () => {
    expect(readStatedExtent("0.21398 Hectares")).toEqual({ m2: 2139.8, as: "ha" });
    expect(readStatedExtent("0.2 ha")!.m2).toBeCloseTo(2000, 9);
    expect(readStatedExtent("1.5 acres")!.m2).toBeCloseTo(6070.2846336, 9);
    expect(perches("34.5 perches")).toBe(34.5);
    expect(perches("10 1/2 perches")).toBe(10.5);
    expect(perches("12 1/2 P")).toBe(12.5);
    expect(readStatedExtent("2,267.41 m²")).toEqual({ m2: 2267.41, as: "m2" });
    expect(readStatedExtent("2267 sq. m")).toEqual({ m2: 2267, as: "m2" });
  });

  it("says nothing it can't read for sure, and refuses impossible roods or perches", () => {
    for (const t of ["", "about half an acre", "2A 5R 3P", "0A 1R 45P", "0-2-04.60 P", "0,21398 ha", "1 A 2", "P 10 R 2", "0.5 ha ( 0 A. 2 R. 0 P. )"]) expect(readStatedExtent(t), t).toBeNull();
  });
});

describe("the re-check's extents", () => {
  it("reads commas between parts, a half acre, and refuses a zero below a fraction", () => {
    expect(readStatedExtent("A.0, R.2, P.4.6")!.m2 / 25.29285264).toBeCloseTo(84.6, 9);
    expect(readStatedExtent("½ acre")!.m2).toBeCloseTo(2023.4282112, 9);
    expect(readStatedExtent("10 0/0 P")).toBeNull();
    expect(readStatedExtent("1/0 acre")).toBeNull();
  });
});
