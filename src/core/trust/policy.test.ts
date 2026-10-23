import { describe, expect, it } from "vitest";
import { CHANGE_POLICY_RULES, LARGE_CHANGE_FILES, changePolicyVersion, evaluateChangePolicy } from "./policy";
import { canonicalHash } from "./canonical-json";

const edit = (path: string) => ({ path, kind: "edit" as const });

describe("change policy", () => {
  it("needs a contributor's approval for an ordinary change (autonomy level 0)", async () => {
    const d = await evaluateChangePolicy({ files: [edit("src/lib/cart.ts"), edit("src/components/card.tsx")], contractViolations: [] });
    expect(d).toMatchObject({ outcome: "REQUIRE_APPROVAL", findings: [] });
  });

  it.each([
    ["package.json", "dependencies"],
    ["apps/web/pnpm-lock.yaml", "dependencies"],
    [".github/workflows/ci.yml", "ci_workflows"],
    ["supabase/migrations/2026_add.sql", "database_migrations"],
    ["db/schema.sql", "database_migrations"],
    ["Dockerfile", "infrastructure"],
    ["infra/main.tf", "infrastructure"],
    ["src/proxy.ts", "auth_and_security"],
    ["src/server/auth/session.ts", "auth_and_security"],
    ["src/lib/permissions.ts", "auth_and_security"],
    ["src/lib/oauth.ts", "auth_and_security"],
  ])("escalates %s (%s)", async (path, rule) => {
    const d = await evaluateChangePolicy({ files: [edit(path)], contractViolations: [] });
    expect(d.outcome).toBe("ESCALATE");
    expect(d.findings.map((f) => f.rule)).toContain(rule);
  });

  it("doesn't flag ordinary files whose names merely look similar", async () => {
    const d = await evaluateChangePolicy({ files: [edit("src/lib/packages-list.ts"), edit("docs/authoring.md"), edit("src/migrate-copy.ts")], contractViolations: [] });
    expect(d.outcome).toBe("REQUIRE_APPROVAL");
  });

  it("escalates large changes and blocks contract violations above everything", async () => {
    const many = Array.from({ length: LARGE_CHANGE_FILES + 1 }, (_, i) => edit(`src/f${i}.ts`));
    expect((await evaluateChangePolicy({ files: many, contractViolations: [] })).outcome).toBe("ESCALATE");
    const blocked = await evaluateChangePolicy({ files: [edit("package.json")], contractViolations: [{ kind: "OUT_OF_SCOPE_PATH", detail: "package.json is outside the contract's paths." }] });
    expect(blocked.outcome).toBe("BLOCK");
    expect(blocked.findings.map((f) => f.outcome)).toEqual(["BLOCK", "ESCALATE"]);
  });

  it("records the hash of the exact rule set", async () => {
    const d = await evaluateChangePolicy({ files: [edit("a.ts")], contractViolations: [] });
    expect(d.policyVersion).toBe(await canonicalHash(CHANGE_POLICY_RULES));
    expect(d.policyVersion).toBe(await changePolicyVersion());
  });
});

describe("autonomy level 2 (ADR 0046)", () => {
  const LIMITS = { level: 2 as const, maxFiles: 2, allowCreates: false };
  const create = (path: string) => ({ path, kind: "create" as const });

  it("lets a small, checked change apply on its own, and says why", async () => {
    const d = await evaluateChangePolicy({ files: [edit("src/lib/cart.ts")], contractViolations: [], autonomy: LIMITS, verifiable: true });
    expect(d.outcome).toBe("ALLOW_WITHIN_LIMITS");
    expect(d.findings).toEqual([expect.objectContaining({ rule: "autonomy", outcome: "ALLOW_WITHIN_LIMITS", detail: expect.stringMatching(/level 2/) })]);
  });

  it("waits for a person when any limit isn't met, naming each one", async () => {
    const tooMany = await evaluateChangePolicy({ files: [edit("a.ts"), edit("b.ts"), edit("c.ts")], contractViolations: [], autonomy: LIMITS, verifiable: true });
    expect(tooMany.outcome).toBe("REQUIRE_APPROVAL");
    expect(tooMany.findings[0]!.detail).toMatch(/3 files, more than the limit of 2/);
    const creates = await evaluateChangePolicy({ files: [create("src/new.ts")], contractViolations: [], autonomy: LIMITS, verifiable: true });
    expect(creates.outcome).toBe("REQUIRE_APPROVAL");
    expect(creates.findings[0]!.detail).toMatch(/creates a new file/);
    const unchecked = await evaluateChangePolicy({ files: [edit("a.ts")], contractViolations: [], autonomy: LIMITS, verifiable: false });
    expect(unchecked.outcome).toBe("REQUIRE_APPROVAL");
    expect(unchecked.findings[0]!.detail).toMatch(/nothing could check it/);
    const allowedCreate = await evaluateChangePolicy({ files: [create("src/new.ts")], contractViolations: [], autonomy: { ...LIMITS, allowCreates: true }, verifiable: true });
    expect(allowedCreate.outcome).toBe("ALLOW_WITHIN_LIMITS");
  });

  it("never lowers a block or an escalation", async () => {
    const sensitive = await evaluateChangePolicy({ files: [edit("package.json")], contractViolations: [], autonomy: LIMITS, verifiable: true });
    expect(sensitive.outcome).toBe("ESCALATE");
    const violation = await evaluateChangePolicy({ files: [edit("a.ts")], contractViolations: [{ kind: "OUT_OF_SCOPE_PATH", detail: "a.ts is outside." }], autonomy: LIMITS, verifiable: true });
    expect(violation.outcome).toBe("BLOCK");
    expect([...sensitive.findings, ...violation.findings].some((f) => f.rule === "autonomy")).toBe(false);
  });

  it("is off by default, and its rules are part of the policy's version", async () => {
    expect((await evaluateChangePolicy({ files: [edit("a.ts")], contractViolations: [] })).outcome).toBe("REQUIRE_APPROVAL");
    expect(CHANGE_POLICY_RULES.schema).toBe("farbaek.policy/v2");
    expect(CHANGE_POLICY_RULES.autonomy.outcome).toBe("ALLOW_WITHIN_LIMITS");
  });
});
