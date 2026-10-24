import { describe, expect, it } from "vitest";
import { DEFAULT_AI_DAILY_LIMIT_USD, platformDailyAiUnits } from "./config";

const read = (value: string | null) => (name: string) => (name === "AI_DAILY_LIMIT_USD" ? value : null);

describe("the platform's daily AI limit", () => {
  it("defaults to a cap, reads dollars as units, and can be turned off on purpose", () => {
    expect(platformDailyAiUnits(read(null))).toBe(DEFAULT_AI_DAILY_LIMIT_USD * 10_000);
    expect(platformDailyAiUnits(read("50"))).toBe(500_000);
    expect(platformDailyAiUnits(read("OFF"))).toBeNull();
  });

  it("falls back to the default for nonsense rather than switching the cap off", () => {
    for (const bad of ["0", "-5", "lots", "Infinity"]) expect(platformDailyAiUnits(read(bad))).toBe(DEFAULT_AI_DAILY_LIMIT_USD * 10_000);
    expect(platformDailyAiUnits(read("1e9"))).toBe(100_000 * 10_000);
  });
});
