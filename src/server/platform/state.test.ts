import { describe, expect, it } from "vitest";
import { nextDismissed } from "@/components/app/announcement-banner";
import { FLAG_DETAILS, PLATFORM_FLAGS, isPlatformFlag } from "@/core/office/flags";
import { publishGate } from "@/core/publish/site";
import { notePlatformFlag, platformPause } from "./state";

describe("platform switches", () => {
  it("explain a pause with the owner's message, or a plain fallback, and clear when turned back on", () => {
    expect(platformPause("publishing")).toBeNull();
    notePlatformFlag("publishing", true, "Publishing is paused while we move servers.");
    expect(platformPause("publishing")).toBe("Publishing is paused while we move servers.");
    notePlatformFlag("ai_runs", true, null);
    expect(platformPause("ai_runs")).toBe(FLAG_DETAILS.ai_runs.fallback);
    notePlatformFlag("publishing", false, null);
    notePlatformFlag("ai_runs", false, null);
    expect(platformPause("publishing")).toBeNull();
    expect(platformPause("ai_runs")).toBeNull();
  });

  it("are the six the database knows, each with plain copy", () => {
    expect([...PLATFORM_FLAGS].sort()).toEqual(["ai_runs", "new_workspaces", "publishing", "sandboxes", "serve_published_sites", "share_links"]);
    for (const f of PLATFORM_FLAGS) {
      expect(FLAG_DETAILS[f].fallback.length).toBeGreaterThan(20);
      expect(FLAG_DETAILS[f].fallback).not.toMatch(/[—–]/);
    }
    expect(isPlatformFlag("everything")).toBe(false);
  });

  it("stop a publish before any other reason", () => {
    expect(publishGate({ domain: "farbaek.si", profile: "static", paths: ["index.html"], filesChangedAt: null, check: null, paused: "Paused for maintenance." })).toEqual({ code: "PAUSED", message: "Paused for maintenance." });
  });
});

describe("announcement banner", () => {
  it("remembers dismissed notices without duplicates, keeping the latest 50", () => {
    expect(nextDismissed(["a", "b"], "a")).toEqual(["b", "a"]);
    const many = Array.from({ length: 60 }, (_, i) => `id-${i}`);
    const next = nextDismissed(many, "new");
    expect(next).toHaveLength(50);
    expect(next.at(-1)).toBe("new");
  });
});
