import { describe, expect, it } from "vitest";
import type { ProposedChange } from "@/core/realityloop/change-proposal";
import { shareLabel, taskCost, type LedgerEntry } from "./cost-brain";
import { classifyChange, reversibilityRadar } from "./reversibility";

const change = (path: string, content: string, kind: "create" | "edit" = "create"): ProposedChange => ({ path, kind, baseRevision: kind === "edit" ? 1 : 0, content, sha256: "a".repeat(64), reason: "r" });

describe("Reversibility Radar", () => {
  it("puts ordinary file changes under rollback, with Farbaek's undo as the basis", () => {
    expect(classifyChange(change("src/app/page.tsx", "export default () => null;\n"), "")).toMatchObject({ area: "files", reversibility: "rollback_supported", basis: expect.stringContaining("Undo") });
  });

  it("tells a structural migration from one that removes data", () => {
    expect(classifyChange(change("supabase/migrations/1_add.sql", "alter table t add column c int;\n"), "")).toMatchObject({ area: "migration", reversibility: "forward_fix" });
    for (const sql of ["drop table t;", "alter table t drop column c;", "delete from t where x;", "truncate t;", "update t set a = 1;"]) {
      expect(classifyChange(change("db/migrate/2.sql", `${sql}\n`), "").reversibility).toBe("requires_backup");
    }
  });

  it("judges an edit by the lines it adds, not the ones already there", () => {
    const base = "drop table old;\n";
    expect(classifyChange(change("migrations/3.sql", `${base}create table n (id int);\n`, "edit"), base).reversibility).toBe("forward_fix");
  });

  it("names dependencies, CI and deploy settings, public APIs and outside services", () => {
    expect(classifyChange(change("package.json", "{}"), "")).toMatchObject({ area: "dependencies", reversibility: "compensating_action" });
    expect(classifyChange(change("pnpm-lock.yaml", "x"), "").area).toBe("dependencies");
    expect(classifyChange(change(".github/workflows/ci.yml", "on: push"), "")).toMatchObject({ area: "ci_infra", reversibility: "compensating_action" });
    expect(classifyChange(change("infra/main.tf", "resource"), "").area).toBe("ci_infra");
    expect(classifyChange(change("src/app/api/orders/route.ts", "export const GET = 1;"), "")).toMatchObject({ area: "public_api", reversibility: "unknown" });
    expect(classifyChange(change("src/lib/notify.ts", "await fetch('https://hooks.example.com/x');"), "")).toMatchObject({ area: "integration", reversibility: "unknown" });
    expect(classifyChange(change("src/lib/pay.ts", "stripe.charges.create()"), "").area).toBe("integration");
  });

  it("orders files hardest first and calls the change by its hardest file", () => {
    const r = reversibilityRadar([change("README.md", "# x"), change("migrations/4.sql", "drop table t;"), change("package.json", "{}")], {});
    expect(r.overall).toBe("requires_backup");
    expect(r.files.map((f) => f.path)).toEqual(["migrations/4.sql", "package.json", "README.md"]);
    expect(reversibilityRadar([change("a.css", "a{}")], {}).overall).toBe("rollback_supported");
  });
});

describe("Cost Brain", () => {
  const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
    operation: "agent_step",
    status: "settled",
    refundReason: null,
    model: "claude-sonnet-5-5",
    units: 100,
    inputTokens: 1_000,
    outputTokens: 200,
    cacheReadTokens: 5_000,
    cacheWriteTokens: 0,
    ...over,
  });

  it("adds a task's usage by operation as shares, labels open reservations as estimates, and counts refunds apart", () => {
    const c = taskCost(
      [
        entry({}),
        entry({ units: 300 }),
        entry({ operation: "contract_draft", model: "claude-haiku-5-5", units: 50, status: "reserved" }),
        entry({ status: "refunded", refundReason: "failed", units: 999 }),
        entry({ status: "refunded", refundReason: "free_retry", units: 999 }),
        entry({ operation: "second_check", status: "refunded", refundReason: "stopped", model: "gpt-6.1-terra", units: 999 }),
      ],
      [
        { billedSeconds: 125, state: "terminated" },
        { billedSeconds: 30, state: "ready" },
      ],
      10_000,
    );
    expect(c.percent).toBe(4.5);
    expect(c.estimated).toBe(true);
    expect(c.refunds).toEqual({ failed: 1, freeRetry: 1, stopped: 1 });
    expect(c.sandbox).toEqual({ sessions: 2, minutes: 3, running: 1 });
    expect(c.operations.map((o) => [o.operation, o.calls, o.percent, o.estimated])).toEqual([
      ["agent_step", 2, 4, false],
      ["contract_draft", 1, 0.5, true],
      ["second_check", 0, 0, false],
    ]);
    expect(c.operations[0]!.tokens).toEqual({ input: 4_000, output: 800, cached: 20_000 });
  });

  it("shows tokens without shares when the allowance isn't known, and never a misleading zero", () => {
    const c = taskCost([entry({ units: 1 })], [], null);
    expect(c.percent).toBeNull();
    expect(shareLabel(null)).toBe("not known");
    expect(shareLabel(0)).toBe("none");
    expect(shareLabel(0.04)).toBe("less than 0.1%");
    expect(shareLabel(12.34)).toBe("12.3%");
  });
});
