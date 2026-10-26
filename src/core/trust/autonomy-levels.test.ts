import { describe, expect, it } from "vitest";
import { LEVEL_3, levelThreeStatus } from "./autonomy-levels";

describe("earning level 3 (ADR 0086)", () => {
  it("is earned by a clean record of changes applied on their own", () => {
    expect(levelThreeStatus({ verified: LEVEL_3.minVerified, failed: 0 })).toEqual({ earned: true });
  });

  it("says how many more are needed, or that a failure resets it, in words", () => {
    expect(levelThreeStatus({ verified: 3, failed: 0 })).toEqual({ earned: false, reason: expect.stringContaining("So far: 3.") });
    expect(levelThreeStatus({ verified: 40, failed: 1 })).toEqual({ earned: false, reason: expect.stringContaining("failed or only partly passed its checks in the last 30 days") });
    expect(levelThreeStatus({ verified: 40, failed: 2 })).toEqual({ earned: false, reason: expect.stringContaining("2 times") });
    expect(levelThreeStatus(null)).toEqual({ earned: false, reason: expect.stringContaining("couldn't be read") });
  });
});
