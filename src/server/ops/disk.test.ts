import { describe, expect, it } from "vitest";
import { diskState } from "./disk";

const GB = 1024 ** 3;

describe("disk state for the readiness check", () => {
  it("is ok with room to spare", () => {
    expect(diskState(71 * GB, 96 * GB)).toBe("ok");
  });

  it("is low under 10% free, or under 5 GB free on any disk", () => {
    expect(diskState(9 * GB, 96 * GB)).toBe("low");
    expect(diskState(4 * GB, 30 * GB)).toBe("low");
    expect(diskState(10 * GB, 96 * GB)).toBe("ok");
  });

  it("doesn't guess when the numbers make no sense", () => {
    expect(diskState(1, 0)).toBe("unknown");
    expect(diskState(Number.NaN, 96 * GB)).toBe("unknown");
  });
});
