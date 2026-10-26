import { describe, expect, it } from "vitest";
import { familyOf, findingWords, listedAs, watchFindings, type ListedModel } from "./model-watch";

const listed: ListedModel[] = [
  { id: "claude-haiku-5-5-20260601", displayName: "Claude Haiku 5.5", createdAt: "2026-06-01T00:00:00Z" },
  { id: "claude-sonnet-5-5-20260901", displayName: "Claude Sonnet 5.5", createdAt: "2026-09-01T00:00:00Z" },
  { id: "claude-sonnet-5-6", displayName: "Claude Sonnet 5.6", createdAt: "2026-10-20T00:00:00Z" },
  { id: "claude-opus-5-5", displayName: "Claude Opus 5.5", createdAt: "2026-09-01T00:00:00Z" },
];
const configured = { fast: "claude-haiku-5-5", standard: "claude-sonnet-5-5", strong: "claude-opus-5-5", frontier: "claude-fable-5-1" };

describe("the daily model check", () => {
  it("matches an alias with or without its date, and names the family", () => {
    expect(listedAs("claude-sonnet-5-5", listed)?.id).toBe("claude-sonnet-5-5-20260901");
    expect(listedAs("claude-opus-5-5", listed)?.id).toBe("claude-opus-5-5");
    expect(listedAs("claude-sonnet-5", listed)).toBeNull();
    expect(familyOf("claude-sonnet-5-6")).toBe("claude-sonnet");
    expect(familyOf("gpt-x")).toBeNull();
  });

  it("finds a model that's gone and a newer one in a family in use", () => {
    expect(watchFindings(configured, listed)).toEqual([
      { kind: "newer", tier: "standard", model: "claude-sonnet-5-5", newer: "claude-sonnet-5-6", displayName: "Claude Sonnet 5.6" },
      { kind: "missing", tier: "frontier", model: "claude-fable-5-1" },
    ]);
  });

  it("finds nothing when every model is listed and none is newer, and doesn't count a model already in use as newer", () => {
    expect(watchFindings({ fast: "claude-haiku-5-5" }, listed)).toEqual([]);
    expect(watchFindings({ standard: "claude-sonnet-5-5", strong: "claude-sonnet-5-6" }, listed)).toEqual([]);
  });

  it("says each finding in a sentence", () => {
    expect(findingWords({ kind: "missing", tier: "frontier", model: "claude-fable-5-1" })).toMatch(/isn't in Anthropic's model list any more/);
    expect(findingWords({ kind: "newer", tier: "standard", model: "claude-sonnet-5-5", newer: "claude-sonnet-5-6", displayName: "Claude Sonnet 5.6" })).toMatch(/^Anthropic lists Claude Sonnet 5\.6/);
  });
});
