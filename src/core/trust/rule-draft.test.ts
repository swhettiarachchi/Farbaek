import { describe, expect, it } from "vitest";
import { acceptDraft, foldersOf } from "./rule-draft";

describe("accepting a drafted rule set", () => {
  it("keeps valid patterns and says which were left out", () => {
    const d = acceptDraft({
      rules: [
        { paths: ["src/billing/**", "/etc/passwd", "src/billing/"], effect: "owner_approval", reason: "  Billing   needs an owner. " },
        { paths: ["../secrets"], effect: "block", reason: "Nope." },
      ],
      ambiguities: ["I took billing to mean src/billing."],
      unsupported: ["Two approvals aren't something rules can require."],
    });
    expect(d.rules).toEqual([{ paths: ["src/billing/"], effect: "owner_approval", reason: "Billing needs an owner." }]);
    expect(d.dropped).toEqual([expect.stringContaining("/etc/passwd"), expect.stringContaining("../secrets")]);
    expect(d.ambiguities).toEqual(["I took billing to mean src/billing."]);
    expect(d.unsupported).toHaveLength(1);
  });

  it("caps what a model can hand back", () => {
    const d = acceptDraft({ rules: Array.from({ length: 30 }, () => ({ paths: ["a/"], effect: "block" as const, reason: "x".repeat(500) })), ambiguities: [], unsupported: [] });
    expect(d.rules).toHaveLength(10);
    expect(d.rules[0]?.reason).toHaveLength(200);
  });

  it("lists folders up to three levels deep", () => {
    expect(foldersOf(["src/billing/plan.ts", "src/a/b/c/d.ts", "README.md"])).toEqual(["src/", "src/a/", "src/a/b/", "src/billing/"]);
  });
});
