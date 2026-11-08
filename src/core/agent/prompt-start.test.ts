import { describe, expect, it } from "vitest";
import { cleanPrompt, isSharedBuild, promptFromShare, isDesignPass, projectNameFromPrompt, starterForPrompt, taskTitleFromPrompt, templateForPrompt } from "./prompt-start";
import { estimateRunShare, shareOfPeriod } from "./run-estimate";
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

describe("promptFromShare", () => {
  it("makes a draft from whatever the other app sent", () => {
    expect(promptFromShare({ text: "A site like this for my bakery" })).toBe("A site like this for my bakery");
    expect(promptFromShare({ title: "Sweet Crumbs", url: "https://sweetcrumbs.example" })).toBe("Sweet Crumbs\nhttps://sweetcrumbs.example");
    expect(promptFromShare({ title: "Ignored", text: "Look at https://a.example please", url: "https://a.example" })).toBe("Look at https://a.example please");
    expect(promptFromShare({ title: "Sweet Crumbs", text: "https://sweetcrumbs.example" })).toBe("Sweet Crumbs\nhttps://sweetcrumbs.example");
  });

  it("is null when there's nothing to use, and keeps within the limit", () => {
    expect(promptFromShare({})).toBeNull();
    expect(promptFromShare({ text: "hi" })).toBeNull();
    expect(promptFromShare({ text: ["an", "array"], title: 3 })).toBeNull();
    expect(promptFromShare({ text: "x".repeat(5_000) })!.length).toBe(2_000);
  });
});

describe("isSharedBuild", () => {
  it("is only the new build page with something shared", () => {
    expect(isSharedBuild("/app/new", new URLSearchParams("text=hello"))).toBe(true);
    expect(isSharedBuild("/app/new", new URLSearchParams("url=https://a.example"))).toBe(true);
    expect(isSharedBuild("/app/new", new URLSearchParams("template=blog"))).toBe(false);
    expect(isSharedBuild("/app/tasks", new URLSearchParams("text=hello"))).toBe(false);
  });
});

describe("projectNameFromPrompt", () => {
  it("drops the request words and keeps the subject", () => {
    expect(projectNameFromPrompt("Build me a landing page for my bakery in Kandy")).toBe("Landing page for my bakery");
    expect(projectNameFromPrompt("Make this the landing page for Ledgerline, a bookkeeping service")).toBe("Landing page for Ledgerline");
    expect(projectNameFromPrompt("Turn this into a shop")).toBe("Turn this into a shop");
    expect(projectNameFromPrompt("Make this into a one-page site for Volt")).toBe("One-page site for Volt");
    expect(projectNameFromPrompt("I want to create a portfolio site")).toBe("Portfolio site");
    expect(projectNameFromPrompt("Can you make an app that tracks my workouts")).toBe("App that tracks my workouts");
    expect(projectNameFromPrompt("bakery website!!")).toBe("Bakery website");
  });

  it("names the thing, however the sentence is punctuated", () => {
    expect(projectNameFromPrompt("Build me a website, for my bakery Sweet Crumbs in Kandy")).toBe("Website for my bakery Sweet Crumbs");
    expect(projectNameFromPrompt("Hi there, build me a website for my bakery")).toBe("Website for my bakery");
    expect(projectNameFromPrompt("Please, make a bakery site.")).toBe("Bakery site");
    expect(projectNameFromPrompt("Project name: Sweet Crumbs, a bakery site")).toBe("Sweet Crumbs");
    expect(projectNameFromPrompt("Clone https://stripe.com for my bakery")).toBe("Clone stripe.com for my bakery");
    expect(projectNameFromPrompt("Build a store selling 1,000 candles")).toBe("Store selling 1,000 candles");
    expect(projectNameFromPrompt("🚀 🚀, build me a shop")).toBe("Shop");
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
    expect(templateForPrompt("A site for my plumbing business")).toBeNull();
    // Asking for an online shop outright makes it a shop, whatever it sells; a café on its own stays a café.
    expect(templateForPrompt("An online shop for my coffee roastery")).toBe("online-store");
    expect(templateForPrompt("A site for my coffee roastery")).toBe("local-business");
  });

  it("starts a site for a software product from the software direction (ADR 0165)", () => {
    expect(templateForPrompt("A website for our invoicing software")).toBe("saas-site");
    expect(templateForPrompt("A site for my startup's scheduling tool, with pricing")).toBe("saas-site");
    expect(templateForPrompt("A landing page for our project management software")).toBe("saas-site");
    expect(templateForPrompt("A marketing site for a B2B analytics product")).toBe("saas-site");
    expect(templateForPrompt("Our platform for small businesses to send quotes")).toBe("saas-site");
    // Hardware launches stay launches, and a coffee shop stays a café.
    expect(templateForPrompt("A launch page for our new wireless earbuds")).toBe("landing-page");
    expect(templateForPrompt("A site for my coffee shop")).toBe("local-business");
    // A site for software is a website, not an app to build.
    expect(starterForPrompt("A website for our invoicing software")).toBe("static-website");
  });

  it("starts anyone who sells time by appointment from the booking direction (ADR 0163)", () => {
    expect(templateForPrompt("A barber shop in Colombo")).toBe("booking");
    expect(templateForPrompt("A site for my hair salon with online booking")).toBe("booking");
    expect(templateForPrompt("Our dental clinic in Kandy, open six days")).toBe("booking");
    expect(templateForPrompt("A yoga studio with a class timetable")).toBe("booking");
    // A spa is still luxury, and a booking page for a photography studio is still a booking.
    expect(templateForPrompt("A spa with treatments you can book")).toBe("luxury");
    expect(templateForPrompt("Bookings for my photography studio")).toBe("booking");
    expect(templateForPrompt("A site to sell beauty products")).toBe("online-store");
  });

  it("starts blogs, journals and newsletters from the blog direction, a food blog included (ADR 0163)", () => {
    expect(templateForPrompt("A blog about my travels")).toBe("blog");
    expect(templateForPrompt("Make this my cooking blog called Kitchen Table, with three recipe posts")).toBe("blog");
    expect(templateForPrompt("A food blog with my mother's recipes")).toBe("blog");
    expect(templateForPrompt("A monthly newsletter and journal for our book club")).toBe("blog");
  });

  it("counts a project's first task and the upgrade brief as first builds", () => {
    expect(isDesignPass("Build the Volt Ride site", 1)).toBe(true);
    expect(isDesignPass("Add opening hours", 3)).toBe(false);
    expect(isDesignPass(taskTitleFromPrompt(UPGRADE_DESIGN.text), 4)).toBe(true);
  });

  it("estimates a whole site as more work than a change, and never past 100%", () => {
    const change = estimateRunShare({ model: "claude-sonnet-5-5", effort: "balanced", periodUnits: 5_000 })!;
    const site = estimateRunShare({ model: "claude-sonnet-5-5", effort: "balanced", periodUnits: 5_000, wholeSite: true })!;
    expect(site.low).toBeGreaterThan(change.low);
    expect(site.high).toBe(change.high);
    // Never more than the whole period, however small the allowance.
    expect(estimateRunShare({ model: "claude-sonnet-5-5", effort: "deep", periodUnits: 500, wholeSite: true })!.high).toBe(100);
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
