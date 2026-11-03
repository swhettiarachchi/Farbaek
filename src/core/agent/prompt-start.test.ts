import { describe, expect, it } from "vitest";
import { cleanPrompt, estimateRunShare, isDesignPass, projectNameFromPrompt, shareOfPeriod, starterForPrompt, taskTitleFromPrompt, templateForPrompt } from "./prompt-start";
import { UPGRADE_DESIGN } from "../media/studio-kit";

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
    expect(starterForPrompt("A REST API for my product catalogue")).toBe("rest-api");
    expect(starterForPrompt("A JSON API service with endpoints for orders")).toBe("rest-api");
    expect(starterForPrompt("An app with an API for my team")).toBe("nextjs-app");
  });
});

describe("premium directions and first builds (ADR 0158)", () => {
  it("starts a website from the direction for its kind of business", () => {
    expect(templateForPrompt("A site for my bakery in Kandy with our cakes and buns")).toBe("local-business");
    expect(templateForPrompt("A one-page site for my coffee shop")).toBe("local-business");
    expect(templateForPrompt("A website for our boutique hotel and spa in Galle")).toBe("luxury");
    expect(templateForPrompt("Luxury villas for rent in Bentota")).toBe("luxury");
    expect(templateForPrompt("A site for my handmade jewellery")).toBe("luxury");
    // A bakery stays a bakery even when it says luxury.
    expect(templateForPrompt("A luxury bakery")).toBe("local-business");
  });

  it("starts portfolios, events, shops and launches from their directions (ADR 0160)", () => {
    expect(templateForPrompt("A portfolio for my architecture practice")).toBe("portfolio");
    expect(templateForPrompt("Make my photography site with five projects")).toBe("portfolio");
    expect(templateForPrompt("A site for my wedding photography business in Galle")).toBe("portfolio");
    expect(templateForPrompt("A page for our book club meetup on 3 May")).toBe("event-page");
    expect(templateForPrompt("Our wedding on 12 June in Kandy, with the schedule and RSVPs")).toBe("event-page");
    expect(templateForPrompt("An online store for my handmade candles")).toBe("online-store");
    expect(templateForPrompt("A site to sell our skincare products")).toBe("online-store");
    expect(templateForPrompt("A launch page for our new wireless earbuds")).toBe("landing-page");
    // A launch on the App Store is a launch, not a shop.
    expect(templateForPrompt("A landing page for my app on the App Store")).toBe("landing-page");
    expect(templateForPrompt("A barber shop in Colombo")).toBeNull();
    expect(templateForPrompt("A blog about gardening")).toBeNull();
    // Asking for an online shop outright makes it a shop, whatever it sells; a café on its own stays a café.
    expect(templateForPrompt("An online shop for my coffee roastery")).toBe("online-store");
    expect(templateForPrompt("A site for my coffee roastery")).toBe("local-business");
  });

  it("counts a project's first task and the upgrade brief as first builds", () => {
    expect(isDesignPass("Build the Volt Ride site", 1)).toBe(true);
    expect(isDesignPass("Add opening hours", 3)).toBe(false);
    expect(isDesignPass(taskTitleFromPrompt(UPGRADE_DESIGN.text), 4)).toBe(true);
  });

  it("estimates a whole site as more work than a change", () => {
    const change = estimateRunShare({ model: "claude-sonnet-5-5", effort: "balanced", periodUnits: 100_000 })!;
    const site = estimateRunShare({ model: "claude-sonnet-5-5", effort: "balanced", periodUnits: 100_000, wholeSite: true })!;
    expect(site.high).toBeGreaterThan(change.high * 2);
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
