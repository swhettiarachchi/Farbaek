import { describe, expect, it } from "vitest";
import { sparkPath } from "./metrics";
import { searchQuery, toHits } from "./search";

const ORG = "00000000-0000-4000-8000-00000000a11c";
const found = {
  workspaces: [{ id: ORG, name: "Alice Studio", suspended: true }],
  people: [
    { id: "00000000-0000-4000-8000-000000000001", email: "alice@example.test", orgId: ORG },
    { id: "00000000-0000-4000-8000-000000000002", email: "new@example.test", orgId: null },
  ],
  sites: [{ id: "00000000-0000-4000-8000-000000000003", name: "alice-cafe", orgId: ORG, workspace: "Alice Studio", live: false, blocked: true }],
};

describe("office quick search", () => {
  it("searches two to a hundred characters, with spaces tidied", () => {
    expect(searchQuery("a")).toBeNull();
    expect(searchQuery("  a ")).toBeNull();
    expect(searchQuery(42)).toBeNull();
    expect(searchQuery("x".repeat(101))).toBeNull();
    expect(searchQuery("  alice   studio ")).toBe("alice studio");
  });

  it("masks emails for roles that may not read them, on the server", () => {
    const masked = toHits(found, false);
    expect(masked.find((h) => h.kind === "person")!.label).not.toContain("alice@");
    expect(JSON.stringify(masked)).not.toContain("alice@example.test");
    expect(toHits(found, true).find((h) => h.kind === "person")!.label).toBe("alice@example.test");
  });

  it("opens records at their visible office paths and says their state in words", () => {
    const hits = toHits(found, true);
    expect(hits.map((h) => h.href)).toEqual([`/workspaces/${ORG}`, `/workspaces/${ORG}`, "/people", `/workspaces/${ORG}`]);
    expect(hits[0]!.hint).toBe("Suspended");
    expect(hits[3]!.hint).toBe("Taken offline · Alice Studio");
    expect(hits.every((h) => !h.href.startsWith("/office"))).toBe(true);
  });
});

describe("sparkline path", () => {
  it("runs left to right across the width, highest value near the top", () => {
    const { line, last } = sparkPath([0, 5, 10], 120, 32);
    expect(line).toBe("M0 31 L60 16.5 L120 2");
    expect(last).toEqual({ x: 120, y: 2 });
  });

  it("draws a flat line along the bottom when every day is zero, and nothing with no data", () => {
    expect(sparkPath([0, 0, 0], 120, 32).line).toBe("M0 31 L60 31 L120 31");
    expect(sparkPath([], 120, 32)).toEqual({ line: "", last: null });
    expect(sparkPath([4], 120, 32).last).toEqual({ x: 0, y: 2 });
  });
});
