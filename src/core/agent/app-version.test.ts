import { describe, expect, it } from "vitest";
import { isNewerVersion } from "./app-version";

describe("isNewerVersion", () => {
  it("compares each part as a number, so 0.10.0 is newer than 0.9.0", () => {
    expect(isNewerVersion("0.10.0", "0.9.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.10.0")).toBe(true);
    expect(isNewerVersion("0.9.0", "0.10.0")).toBe(false);
    expect(isNewerVersion("0.10.0", "0.10.0")).toBe(false);
  });

  it("doesn't nag anyone over something it can't read", () => {
    expect(isNewerVersion("soon", "0.9.0")).toBe(false);
    expect(isNewerVersion("0.10.0", "dev")).toBe(false);
  });
});
