import { describe, expect, it } from "vitest";
import { matchScore } from "./command-match";

describe("matchScore", () => {
  it("matches every word typed, in the label or the keywords", () => {
    expect(matchScore("", "Projects")).toBe(1);
    expect(matchScore("bill", "Billing and usage")).toBe(4);
    expect(matchScore("usage", "Billing and usage")).toBe(3);
    expect(matchScore("ling", "Billing and usage")).toBe(2);
    expect(matchScore("money", "Billing and usage", ["plan", "money"])).toBe(1);
    expect(matchScore("bakery site", "One-page site for Sunrise Bakery")).toBe(3);
    expect(matchScore("bakery cafe", "One-page site for Sunrise Bakery")).toBe(0);
  });
});
