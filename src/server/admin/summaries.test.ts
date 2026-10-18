import { describe, expect, it } from "vitest";
import { aiCostUsd, countBy, latestBy, monthStartUtc, usd } from "./summaries";

describe("admin summaries", () => {
  it("prices settled units at $0.0001 each, to the cent", () => {
    expect(aiCostUsd([])).toBe(0);
    expect(aiCostUsd([{ credits: 163 }, { credits: 4 }, { credits: 147 }])).toBe(0.03);
    expect(aiCostUsd([{ credits: 125_000 }, { credits: 50 }])).toBe(12.51);
    expect(aiCostUsd([{ credits: -5 }, { credits: 10_000 }])).toBe(1);
    expect(usd(12.5)).toBe("$12.50");
  });

  it("starts the month at midnight UTC on the 1st", () => {
    expect(monthStartUtc(new Date("2026-10-18T23:30:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(monthStartUtc(new Date("2027-01-01T00:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("counts and finds the latest per workspace", () => {
    const rows = [
      { org: "a", at: "2026-10-01T00:00:00Z" },
      { org: "b", at: "2026-10-05T00:00:00Z" },
      { org: "a", at: "2026-10-09T00:00:00Z" },
    ];
    expect(Object.fromEntries(countBy(rows, (r) => r.org))).toEqual({ a: 2, b: 1 });
    expect(Object.fromEntries(latestBy(rows, (r) => r.org, (r) => r.at))).toEqual({ a: "2026-10-09T00:00:00Z", b: "2026-10-05T00:00:00Z" });
  });
});
