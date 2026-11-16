import { describe, expect, it } from "vitest";
import { DEFAULT_AI_DAILY_LIMIT_USD, DEFAULT_SURVEY_FREE_DAILY_USD, platformDailyAiUnits, surveyFreeDailyUnits } from "./config";

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

describe("Survey Studio's free daily limit (ADR 0212)", () => {
  const free = (value: string | null) => (name: string) => (name === "SURVEY_AI_FREE_DAILY_USD" ? value : null);
  it("defaults to a few dollars a day, inside the platform's own limit, and can be turned off on purpose", () => {
    expect(surveyFreeDailyUnits(free(null))).toBe(DEFAULT_SURVEY_FREE_DAILY_USD * 10_000);
    expect(DEFAULT_SURVEY_FREE_DAILY_USD).toBeLessThan(DEFAULT_AI_DAILY_LIMIT_USD);
    expect(surveyFreeDailyUnits(free("5"))).toBe(50_000);
    expect(surveyFreeDailyUnits(free("off"))).toBeNull();
    for (const bad of ["0", "-1", "free", "NaN"]) expect(surveyFreeDailyUnits(free(bad))).toBe(DEFAULT_SURVEY_FREE_DAILY_USD * 10_000);
  });
});
