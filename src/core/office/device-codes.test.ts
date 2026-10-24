import { describe, expect, it } from "vitest";
import { DEVICE_CODE_ALPHABET, formatDeviceCode, newDeviceCode, normalizeDeviceCode } from "./device-codes";

describe("device-add codes", () => {
  it("makes 8 characters with no look-alikes", () => {
    for (let i = 0; i < 200; i++) {
      const code = newDeviceCode();
      expect(code).toMatch(/^[A-Z2-9]{8}$/);
      expect(code).not.toMatch(/[01OIL]/);
    }
    expect(DEVICE_CODE_ALPHABET).toHaveLength(31);
  });

  it("reads what people type, and refuses anything else", () => {
    expect(normalizeDeviceCode("k7p2-9xqm")).toBe("K7P29XQM");
    expect(normalizeDeviceCode(" K7P2 9XQM ")).toBe("K7P29XQM");
    expect(normalizeDeviceCode("K7P29XQ")).toBeNull();
    expect(normalizeDeviceCode("K7P29XQ0")).toBeNull();
    expect(normalizeDeviceCode(null)).toBeNull();
    expect(formatDeviceCode("K7P29XQM")).toBe("K7P2 9XQM");
  });
});
