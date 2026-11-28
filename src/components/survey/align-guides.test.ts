/** Alignment guides for a dragged word or label (stage 297). SYNTHETIC positions. */
import { describe, expect, it } from "vitest";
import { alignTo } from "./align-guides";

describe("lining a dragged word up with the others", () => {
  const others = [
    { x: 40, y: 100 },
    { x: 80, y: 60 },
  ];

  it("snaps across and down apart to the nearest within reach, and says where", () => {
    expect(alignTo({ x: 40.8, y: 70 }, others, 1)).toEqual({ x: 40, y: 70, guides: { x: 40, y: null } });
    expect(alignTo({ x: 55, y: 59.4 }, others, 1)).toEqual({ x: 55, y: 60, guides: { x: null, y: 60 } });
    expect(alignTo({ x: 79.5, y: 99.2 }, others, 1)).toEqual({ x: 80, y: 100, guides: { x: 80, y: 100 } });
  });

  it("leaves it where the pointer puts it when nothing is near enough, or there's nothing else", () => {
    expect(alignTo({ x: 50, y: 80 }, others, 1)).toEqual({ x: 50, y: 80, guides: { x: null, y: null } });
    expect(alignTo({ x: 50, y: 80 }, [], 1)).toEqual({ x: 50, y: 80, guides: { x: null, y: null } });
  });

  it("takes the nearest of two within reach, and ignores points that aren't numbers", () => {
    expect(alignTo({ x: 40.6, y: 0 }, [{ x: 40, y: 500 }, { x: 41, y: 600 }, { x: Number.NaN, y: 0 }], 1).x).toBe(41);
  });
});
