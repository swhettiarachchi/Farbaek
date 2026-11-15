/** Reading a stated extent: hand-worked answers from the unit definitions (1 P = 25.29285264 m², 40 P = 1 R, 4 R = 1 A). */
import { describe, expect, it } from "vitest";
import { readStatedExtent } from "./extent";

describe("stated extents as deeds and plans write them", () => {
  it("reads acres, roods and perches in the usual forms", () => {
    // 2 R 4.60 P = 84.60 P = 2139.79533... m².
    const want = 84.6 * 25.29285264;
    for (const t of ["0 A. 2 R. 04.60 P.", "0A 2R 4.6P", "A0-R2-P4.60", "0 acres 2 roods 4.6 perches", "2R. 04.60P.", "0.21398 Hectares ( 0 A. 2 R. 04.60 P. )"]) {
      const r = readStatedExtent(t);
      expect(r, t).not.toBeNull();
      expect(r!.as, t).toBe("arp");
      expect(r!.m2, t).toBeCloseTo(want, 9);
    }
    expect(readStatedExtent("1 A. 0 R. 0 P.")!.m2).toBeCloseTo(4046.8564224, 9);
  });

  it("reads hectares, acres, perches and square metres", () => {
    expect(readStatedExtent("0.21398 Hectares")).toEqual({ m2: 2139.8, as: "ha" });
    expect(readStatedExtent("0.2 ha")!.m2).toBeCloseTo(2000, 9);
    expect(readStatedExtent("1.5 acres")!.m2).toBeCloseTo(6070.2846336, 9);
    expect(readStatedExtent("34.5 perches")!.m2).toBeCloseTo(34.5 * 25.29285264, 9);
    expect(readStatedExtent("2,267.41 m²")).toEqual({ m2: 2267.41, as: "m2" });
    expect(readStatedExtent("2267 sq. m")).toEqual({ m2: 2267, as: "m2" });
  });

  it("says nothing it can't read, and refuses impossible roods or perches", () => {
    expect(readStatedExtent("")).toBeNull();
    expect(readStatedExtent("about half an acre")).toBeNull();
    expect(readStatedExtent("2A 5R 3P")).toBeNull();
    expect(readStatedExtent("0A 1R 45P")).toBeNull();
  });
});
