import { describe, expect, it } from "vitest";
import { ruleExamples, ruleFlags } from "./rule-review";
import { compileRuleSet, explainRule, matchRules, nextRuleId, parseRuleSet, ruleSetHash, RULES_SCHEMA } from "./workspace-rules";

const rule = (over: Record<string, unknown> = {}) => ({ id: "r1", paths: ["src/billing/"], effect: "owner_approval", reason: "Billing needs an owner.", ...over });

describe("parsing a rule set", () => {
  it("normalizes a valid set", () => {
    const parsed = parseRuleSet({ rules: [rule({ paths: [" src/billing/** ", "src/billing/", ""], reason: "  Billing   needs an owner. " })] });
    expect(parsed).toEqual({ ok: true, set: { schema: RULES_SCHEMA, rules: [{ id: "r1", paths: ["src/billing/"], effect: "owner_approval", reason: "Billing needs an owner." }] } });
  });

  it("returns every error with the rule and field it belongs to", () => {
    const parsed = parseRuleSet({ rules: [rule({ paths: [] }), rule({ id: "r1", effect: "allow" }), rule({ id: "r3", paths: ["../x"], reason: "" })] });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 0, field: "paths" }),
        expect.objectContaining({ rule: 1, field: "id", message: "Two rules share an id." }),
        expect.objectContaining({ rule: 1, field: "effect" }),
        expect.objectContaining({ rule: 2, field: "paths", message: expect.stringContaining("../x") }),
        expect.objectContaining({ rule: 2, field: "reason" }),
      ]),
    );
    expect(parseRuleSet(null).ok).toBe(false);
    expect(parseRuleSet({ rules: Array.from({ length: 21 }, (_, i) => rule({ id: `r${i}` })) }).ok).toBe(false);
  });

  it("hashes the same set the same way, whatever the key order", async () => {
    const a = parseRuleSet({ rules: [rule()] });
    const b = parseRuleSet({ rules: [{ reason: "Billing needs an owner.", effect: "owner_approval", paths: ["src/billing/"], id: "r1" }] });
    if (!a.ok || !b.ok) throw new Error("parse");
    expect(await ruleSetHash(a.set)).toBe(await ruleSetHash(b.set));
    expect(await ruleSetHash(a.set)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("compiles each rule for the database", () => {
    const p = parseRuleSet({ rules: [rule({ paths: ["*.sql", "src/billing/"] })] });
    if (!p.ok) throw new Error("parse");
    expect(compileRuleSet(p.set)).toEqual([{ id: "r1", effect: "owner_approval", regex: ["^(.*/)?[^/]*\\.sql$", "^src/billing/.*$"] }]);
  });
});

describe("explaining and matching", () => {
  it("explains a rule in Farbaek's words, not a model's", () => {
    expect(explainRule({ paths: ["src/billing/"], effect: "owner_approval" })).toBe("A change to any file inside src/billing needs an owner or admin to approve.");
    expect(explainRule({ paths: ["*.sql", "db/"], effect: "block" })).toBe("A change to any file named like *.sql or any file inside a folder named db is stopped, and no one can approve it.");
    expect(explainRule({ paths: ["docs/"], effect: "person_approval" })).toContain("always waits for a person, even at autonomy level 2");
  });

  it("finds every rule a path falls under", () => {
    const rules = [rule(), rule({ id: "r2", paths: ["*.ts"], effect: "person_approval" })] as never;
    expect(matchRules(rules, "src/billing/plan.ts").map((m) => [m.rule.id, m.pattern])).toEqual([
      ["r1", "src/billing/"],
      ["r2", "*.ts"],
    ]);
    expect(matchRules(rules, "README.md")).toEqual([]);
  });

  it("picks an unused id", () => {
    expect(nextRuleId([])).toBe("r1");
    expect(nextRuleId([{ id: "r1" }, { id: "r2" }])).toBe("r3");
    expect(nextRuleId([{ id: "r2" }])).toBe("r3");
  });
});

describe("reviewing a draft", () => {
  const files = [
    { project: "Shop", path: "src/billing/plan.ts" },
    { project: "Shop", path: "src/billing/invoice.ts" },
    { project: "Shop", path: "package.json" },
    { project: "Shop", path: "docs/readme.md" },
  ];

  it("shows the files each rule matches", () => {
    expect(ruleExamples([rule()] as never, files)).toEqual([{ rule: "r1", files: ["src/billing/plan.ts", "src/billing/invoice.ts"], count: 2 }]);
  });

  it("flags patterns that match nothing, cover everything, or repeat", () => {
    const flags = ruleFlags([rule({ paths: ["src/payments/", "src/billing/"] }), rule({ id: "r2", paths: ["**", "src/billing/"], effect: "block" })] as never, files);
    expect(flags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "r1", kind: "no_match", tone: "warning", text: expect.stringContaining("src/payments/") }),
        expect.objectContaining({ rule: "r2", kind: "everything", tone: "warning", text: "** covers every file, so every change would be stopped." }),
        expect.objectContaining({ rule: "r2", kind: "duplicate" }),
        expect.objectContaining({ rule: "r2", kind: "overlap", text: expect.stringContaining("The stricter applies: stop the change.") }),
      ]),
    );
  });

  it("notes a rule the built-in policy already covers", () => {
    const flags = ruleFlags([rule({ paths: ["package.json"] })] as never, files);
    expect(flags).toEqual([expect.objectContaining({ kind: "built_in", tone: "note" })]);
  });

  it("doesn't call a pattern unmatched when there are no files to check", () => {
    expect(ruleFlags([rule({ paths: ["src/payments/"] })] as never, [])).toEqual([]);
  });
});
