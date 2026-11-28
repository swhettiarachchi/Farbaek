import { describe, expect, it } from "vitest";
import { DEFAULT_AI_DAILY_LIMIT_USD, DEFAULT_SURVEY_FREE_DAILY_USD, SURVEY_FREE_BOOST, platformDailyAiUnits, surveyFreeDailyUnits } from "./config";

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
  const during = new Date("2026-11-29T12:00:00.000Z");
  const after = new Date("2026-12-08T00:00:00.000Z");
  it("defaults to a few dollars a day, inside the platform's own limit, and can be turned off on purpose", () => {
    expect(surveyFreeDailyUnits(free(null), after)).toBe(DEFAULT_SURVEY_FREE_DAILY_USD * 10_000);
    expect(DEFAULT_SURVEY_FREE_DAILY_USD).toBeLessThan(DEFAULT_AI_DAILY_LIMIT_USD);
    expect(surveyFreeDailyUnits(free("5"), after)).toBe(50_000);
    expect(surveyFreeDailyUnits(free("off"), after)).toBeNull();
    for (const bad of ["0", "-1", "free", "NaN"]) expect(surveyFreeDailyUnits(free(bad), after)).toBe(DEFAULT_SURVEY_FREE_DAILY_USD * 10_000);
  });

  it("has more room for ten days, never less than the setting, and goes back by itself", () => {
    expect(surveyFreeDailyUnits(free(null), during)).toBe(SURVEY_FREE_BOOST.usd * 10_000);
    expect(surveyFreeDailyUnits(free("25"), during)).toBe(250_000);
    expect(surveyFreeDailyUnits(free("off"), during)).toBeNull();
    expect(surveyFreeDailyUnits(free(null), after)).toBe(DEFAULT_SURVEY_FREE_DAILY_USD * 10_000);
    expect(SURVEY_FREE_BOOST.usd).toBeLessThan(DEFAULT_AI_DAILY_LIMIT_USD);
    expect(Date.parse(SURVEY_FREE_BOOST.until) - Date.parse("2026-11-28T00:00:00.000Z")).toBe(10 * 86_400_000);
  });
});
