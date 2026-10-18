import { describe, expect, it } from "vitest";
import { aiUsageMultiple, meterState, percentUsed, resetText, usageNote } from "./usage-view";
import { PLANS } from "./catalog";

describe("percent used", () => {
  it("rounds up so any use shows, and keeps 100% for the limit itself", () => {
    expect(percentUsed(0, 100)).toBe(0);
    expect(percentUsed(0.2, 100)).toBe(1);
    expect(percentUsed(10, 100)).toBe(10);
    expect(percentUsed(10.1, 100)).toBe(11);
    expect(percentUsed(99.6, 100)).toBe(99);
    expect(percentUsed(100, 100)).toBe(100);
    expect(percentUsed(140, 100)).toBe(100);
    expect(percentUsed(3, 0)).toBe(100);
    expect(percentUsed(5, null)).toBeNull();
    expect(percentUsed(Number.NaN, 10)).toBe(0);
  });

  it("names the state at 80% and at the limit", () => {
    expect(meterState(79)).toBe("ok");
    expect(meterState(80)).toBe("nearly");
    expect(meterState(99)).toBe("nearly");
    expect(meterState(100)).toBe("reached");
    expect(meterState(null)).toBe("ok");
  });
});

describe("reset text", () => {
  const now = new Date("2026-10-18T09:00:00Z");
  const at = (ms: number) => new Date(now.getTime() + ms);
  const text = (ms: number, period: "trial" | "month" = "month") => resetText(at(ms), period, now, "en-US", "UTC");

  it("counts down within a day", () => {
    expect(text(45 * 60_000)).toBe("Resets in 45 min");
    expect(text(20_000)).toBe("Resets in 1 min");
    expect(text(3 * 3_600_000 + 15 * 60_000)).toBe("Resets in 3 hr 15 min");
    expect(text(5 * 3_600_000)).toBe("Resets in 5 hr");
  });

  it("names the day within a week, and the date beyond", () => {
    // 2026-10-18 is a Sunday; four days later is Thursday.
    expect(text(4 * 86_400_000 + 3.5 * 3_600_000)).toBe("Resets Thu 12:30 PM");
    expect(resetText(new Date("2026-11-01T00:00:00Z"), "month", now, "en-US", "UTC")).toBe("Resets Nov 1");
  });

  it("says a trial limit ends with the trial", () => {
    expect(resetText(new Date("2026-10-28T06:00:00Z"), "trial", now, "en-US", "UTC")).toBe("Ends with the trial on Oct 28");
    expect(text(-1)).toBe("Resets now");
  });
});

describe("usage note", () => {
  it("speaks up only from 80%", () => {
    expect(usageNote(79)).toBeNull();
    expect(usageNote(84)).toBe("You've used 84% of your AI usage.");
    expect(usageNote(100)).toBe("You've reached your AI usage limit.");
    expect(usageNote(null)).toBeNull();
  });
});

describe("AI usage between plans", () => {
  it("compares plans to Free from the catalog, without exposing allowances", () => {
    const free = PLANS.find((p) => p.id === "free")!.limits.aiCreditsPerMonth!;
    expect(PLANS.map((p) => `${p.id}: ${aiUsageMultiple(p.limits.aiCreditsPerMonth, free)}`)).toEqual(["free: Included", "developer: 5x Free", "team: 25x Free", "business: 125x Free", "enterprise: Custom"]);
    expect(aiUsageMultiple(30, 20)).toBe("1.5x Free");
  });
});
