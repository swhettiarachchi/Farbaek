import { describe, expect, it } from "vitest";
import { CHANGE_POLICY_RULES, LARGE_CHANGE_FILES, changePolicyVersion, evaluateChangePolicy } from "./policy";
import { canonicalHash } from "./canonical-json";

const edit = (path: string) => ({ path, kind: "edit" as const });

describe("change policy v1", () => {
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
