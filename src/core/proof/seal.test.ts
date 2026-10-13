import { describe, expect, it } from "vitest";
import { sealGeometry } from "./seal";

const a = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const b = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("sealGeometry", () => {
  it("is deterministic for a digest", () => {
    expect(sealGeometry(a)).toEqual(sealGeometry(a));
  });

  it("differs between digests", () => {
    const ga = sealGeometry(a);
    const gb = sealGeometry(b);
    expect(ga.layers.map((l) => l.d)).not.toEqual(gb.layers.map((l) => l.d));
    expect(ga.ticks).not.toBe(gb.ticks);
  });

  it("encodes one tick per hex digit", () => {
    expect(sealGeometry(a).ticks.match(/M/g)).toHaveLength(64);
  });

  it("stays inside the outer ring", () => {
    const g = sealGeometry(a, 240);
    const coords = g.layers.flatMap((l) => [...l.d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const));
    for (const [x, y] of coords) {
      expect(Math.hypot(x - g.center, y - g.center)).toBeLessThanOrEqual(g.innerRadius + 0.5);
    }
  });

  it("refuses anything that isn't a SHA-256 hex digest", () => {
    expect(() => sealGeometry("abc")).toThrow();
    expect(() => sealGeometry(a.toUpperCase())).toThrow();
  });
});
