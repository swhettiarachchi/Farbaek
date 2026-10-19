import { describe, expect, it } from "vitest";
import { cleanPrompt, estimateRunShare, projectNameFromPrompt, shareOfPeriod, starterForPrompt, taskTitleFromPrompt } from "./prompt-start";

describe("cleanPrompt", () => {
  it("trims, normalises spacing and enforces limits", () => {
    expect(cleanPrompt("  Build me  a\r\nbakery site  ")).toBe("Build me a\nbakery site");
    expect(cleanPrompt("hi")).toBeNull();
    expect(cleanPrompt(42)).toBeNull();
    expect(cleanPrompt("a".repeat(3_000))!.length).toBe(2_000);
    expect(cleanPrompt("one\n\n\n\n\ntwo words here")).toBe("one\n\ntwo words here");
  });
});

describe("projectNameFromPrompt", () => {
  it("drops the request words and keeps the subject", () => {
    expect(projectNameFromPrompt("Build me a landing page for my bakery in Kandy")).toBe("Landing page for my bakery");
    expect(projectNameFromPrompt("I want to create a portfolio site")).toBe("Portfolio site");
    expect(projectNameFromPrompt("Can you make an app that tracks my workouts")).toBe("App that tracks my workouts");
    expect(projectNameFromPrompt("bakery website!!")).toBe("Bakery website");
  });

  it("falls back when nothing is left", () => {
    expect(projectNameFromPrompt("!!!???")).toBe("New project");
  });
});

describe("taskTitleFromPrompt", () => {
  it("uses the first line, within 200 characters", () => {
    expect(taskTitleFromPrompt("A bakery site\nwith a menu")).toBe("A bakery site");
    expect(taskTitleFromPrompt("x".repeat(250)).length).toBe(200);
  });
});

describe("starterForPrompt", () => {
  it("picks a Next.js app for app-like requests and a static site otherwise", () => {
    expect(starterForPrompt("A landing page for my bakery")).toBe("static-website");
    expect(starterForPrompt("A portfolio with my photos")).toBe("static-website");
    expect(starterForPrompt("A dashboard where users log in and see orders")).toBe("nextjs-app");
    expect(starterForPrompt("Build a booking system for my salon")).toBe("nextjs-app");
    expect(starterForPrompt("Make a todo app")).toBe("nextjs-app");
  });
});

describe("estimateRunShare", () => {
  it("gives a range of whole percents, widest for Deep", () => {
    const balanced = estimateRunShare({ model: "claude-sonnet-5-5", effort: "balanced", periodUnits: 100_000 })!;
    const deep = estimateRunShare({ model: "claude-sonnet-5-5", effort: "deep", periodUnits: 100_000 })!;
    expect(balanced.low).toBeGreaterThanOrEqual(1);
    expect(balanced.high).toBeGreaterThan(balanced.low);
    expect(deep.high).toBeGreaterThan(balanced.high);
  });

  it("is never below 1% and is null without an allowance", () => {
    expect(estimateRunShare({ model: "claude-haiku-5-5", effort: "fast", periodUnits: 100_000_000 })).toEqual({ low: 1, high: 1 });
    expect(estimateRunShare({ model: "claude-sonnet-5-5", effort: "balanced", periodUnits: null })).toBeNull();
    expect(estimateRunShare({ model: "claude-sonnet-5-5", effort: "balanced", periodUnits: 0 })).toBeNull();
  });
});

describe("shareOfPeriod", () => {
  it("shows small shares with care and larger ones as whole percents", () => {
    expect(shareOfPeriod(0, 100_000)).toBe("0%");
    expect(shareOfPeriod(50, 100_000)).toBe("under 0.1%");
    expect(shareOfPeriod(400, 100_000)).toBe("0.4%");
    expect(shareOfPeriod(3_200, 100_000)).toBe("3%");
    expect(shareOfPeriod(100, null)).toBeNull();
  });
});
