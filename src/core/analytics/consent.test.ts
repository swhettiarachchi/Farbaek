import { describe, expect, it } from "vitest";
import { CHOICE_DAYS, isAnalyticsCookie, isPrivatePath, mayLoad, readChoice, shouldAsk, storeChoice, validMeasurementId } from "./consent";

const now = new Date("2026-11-03T10:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe("the visitor's choice", () => {
  it("reads back what was stored", () => {
    expect(readChoice(storeChoice("allowed", now), now)).toBe("allowed");
    expect(readChoice(storeChoice("declined", now), now)).toBe("declined");
  });

  it("asks again after a year", () => {
    expect(readChoice(storeChoice("allowed", daysAgo(CHOICE_DAYS - 1)), now)).toBe("allowed");
    expect(readChoice(storeChoice("allowed", daysAgo(CHOICE_DAYS + 1)), now)).toBeNull();
  });

  it("treats anything unreadable as no choice", () => {
    for (const raw of [null, "", "allowed", "{}", '{"choice":"maybe","at":"2026-11-03T10:00:00Z"}', '{"choice":"allowed","at":"soon"}', '{"choice":"allowed","at":"2027-01-01T00:00:00Z"}']) {
      expect(readChoice(raw, now)).toBeNull();
    }
  });
});

describe("loading Google Analytics", () => {
  it("loads only with a valid ID, outside the apps, after the visitor allows it", () => {
    expect(mayLoad("G-ABC1234", "allowed", false)).toBe(true);
    expect(mayLoad("G-ABC1234", "declined", false)).toBe(false);
    expect(mayLoad("G-ABC1234", null, false)).toBe(false);
    expect(mayLoad("G-ABC1234", "allowed", true)).toBe(false);
    expect(mayLoad(null, "allowed", false)).toBe(false);
    expect(mayLoad("UA-12345-1", "allowed", false)).toBe(false);
  });

  it("asks only when it's set up, outside the apps, and there's no choice yet", () => {
    expect(shouldAsk("G-ABC1234", null, false)).toBe(true);
    expect(shouldAsk("G-ABC1234", "declined", false)).toBe(false);
    expect(shouldAsk("G-ABC1234", null, true)).toBe(false);
    expect(shouldAsk(null, null, false)).toBe(false);
  });

  it("never counts private pages, such as invite links with their token", () => {
    expect(isPrivatePath("/invite/abc123token")).toBe(true);
    expect(isPrivatePath("/sign-in/password")).toBe(true);
    expect(isPrivatePath("/delete-account")).toBe(true);
    expect(isPrivatePath("/app/billing")).toBe(true);
    expect(isPrivatePath(null)).toBe(true);
    expect(isPrivatePath("/")).toBe(false);
    expect(isPrivatePath("/pricing")).toBe(false);
    expect(isPrivatePath("/sign-in")).toBe(false);
    expect(isPrivatePath("/invites-are-public")).toBe(false);
  });

  it("knows Google Analytics' cookie names and nothing else", () => {
    expect(validMeasurementId("G-ABC1234")).toBe(true);
    expect(validMeasurementId("g-abc1234")).toBe(false);
    expect(isAnalyticsCookie("_ga")).toBe(true);
    expect(isAnalyticsCookie("_ga_ABC1234")).toBe(true);
    expect(isAnalyticsCookie("_gat")).toBe(false);
    expect(isAnalyticsCookie("fb_ws")).toBe(false);
  });
});
