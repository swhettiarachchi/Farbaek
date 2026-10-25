/**
 * Migration v52: workspace rules (ADR 0082). Owners and admins activate
 * numbered versions; members read them; and the database refuses a new
 * proposal whose outcome is weaker than the active rules require.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compileRuleSet, parseRuleSet, ruleSetHash, type WorkspaceRuleSet } from "@/core/trust/workspace-rules";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;
const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => asService(async () => (await db.query<T>(sql, params)).rows);
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const H = (c: string) => c.repeat(64);
let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `wr-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
const version = async (task: string) => (await admin<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;

const set = (rules: { paths: string[]; effect: string; reason?: string }[]): WorkspaceRuleSet => {
  const parsed = parseRuleSet({ rules: rules.map((r, i) => ({ id: `r${i + 1}`, reason: "Because.", ...r })) });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.set;
};

async function activate(actor: string, rules: WorkspaceRuleSet, overrides: { compiled?: unknown; tested?: unknown } = {}) {
  const sha256 = await ruleSetHash(rules);
  const tested = overrides.tested ?? { sha256, days: 90, changes: 0, before: {}, after: {}, stricter: 0, looser: 0, changed: [], testedAt: new Date().toISOString() };
  const rows = await q<{ v: number }>("select public.app_activate_workspace_rules($1, $2, $3, $4, $5, $6) as v", [
    org,
    actor,
    JSON.stringify(rules),
    JSON.stringify(overrides.compiled ?? compileRuleSet(rules)),
    sha256,
    JSON.stringify(tested),
  ]);
  return rows[0]!.v;
}

/** A pending proposal changing `path`, decided with `outcome`. */
async function propose(path: string, outcome: string) {
  const task = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, `Change ${++seq}`]))[0]!.id;
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [
    task,
    USERS.alice,
    JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1, requiredChecks: [] }),
    H("c"),
    JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")]),
  ]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [task, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  const content = "x";
  const last = outcome === "BLOCK" ? step("POLICY_EVALUATED", "BLOCKED", "block", "system") : step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system");
  return q("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'm', 1, 1, $6, $7, $8, 1000, $9, $10)", [
    task,
    USERS.alice,
    JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
    JSON.stringify([{ path, kind: "create", base_revision: 0, content, sha256: sha(content), reason: "r" }]),
    H("b"),
    await version(task),
    JSON.stringify([step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"), step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"), last]),
    JSON.stringify({ outcome, version: H("e"), findings: [] }),
    new Date(Date.now() - 86_400_000).toISOString(),
    new Date(Date.now() + 86_400_000).toISOString(),
  ]);
}

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("activating workspace rules", () => {
  it("activates numbered versions, one at a time, and records each", async () => {
    expect(await activate(USERS.alice, set([{ paths: ["src/billing/"], effect: "owner_approval" }]))).toBe(1);
    expect(await activate(USERS.alice, set([{ paths: ["*.sql"], effect: "block" }]))).toBe(2);
    const rows = await admin<{ version: number; active: boolean }>("select version, active from public.workspace_rule_versions where org_id = $1 order by version", [org]);
    expect(rows).toEqual([
      { version: 1, active: false },
      { version: 2, active: true },
    ]);
    const audit = await admin<{ target: string }>("select target from public.audit_events where org_id = $1 and action = 'policy.rules_activated' order by id", [org]);
    expect(audit.map((a) => a.target)).toEqual(["workspace_rules:v1", "workspace_rules:v2"]);
  });

  it("is for owners and admins of the workspace only, through the server", async () => {
    await expect(activate(USERS.bob, set([]))).rejects.toThrow(/FORBIDDEN/);
    await expect(
      as(db, "authenticated", USERS.alice, () => db.query("select public.app_activate_workspace_rules($1, $2, '{}', '[]', $3, '{}')", [org, USERS.alice, H("a")])),
    ).rejects.toThrow(/permission denied/);
  });

  it("refuses a set that doesn't hold together", async () => {
    const rules = set([{ paths: ["docs/"], effect: "block" }]);
    await expect(activate(USERS.alice, rules, { compiled: [] })).rejects.toThrow(/INVALID_RULES/);
    await expect(activate(USERS.alice, rules, { compiled: [{ id: "r1", effect: "allow", regex: ["^docs/.*$"] }] })).rejects.toThrow(/INVALID_RULES/);
    await expect(activate(USERS.alice, rules, { compiled: [{ id: "r1", effect: "block", regex: ["docs"] }] })).rejects.toThrow(/INVALID_RULES/);
    await expect(activate(USERS.alice, rules, { compiled: [{ id: "r1", effect: "block", regex: ["^(docs$"] }] })).rejects.toThrow();
    await expect(activate(USERS.alice, rules, { tested: { sha256: H("0") } })).rejects.toThrow(/INVALID_RULES/);
  });

  it("lets members read their workspace's rules, and no one else", async () => {
    const mine = await as(db, "authenticated", USERS.alice, () => db.query("select version from public.workspace_rule_versions"));
    expect(mine.rows.length).toBeGreaterThan(0);
    const theirs = await as(db, "authenticated", USERS.bob, () => db.query("select version from public.workspace_rule_versions where org_id = $1", [org]));
    expect(theirs.rows).toEqual([]);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("delete from public.workspace_rule_versions"))).rejects.toThrow(/permission denied/);
  });

  it("accepts policy drafting in the usage ledger", async () => {
    const check = await admin<{ def: string }>("select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'ai_credit_ledger_operation_check'");
    expect(check[0]!.def).toContain("policy_draft");
  });
});

describe("the database's own check on new changes", () => {
  it("refuses an outcome weaker than the active rules need", async () => {
    await activate(
      USERS.alice,
      set([
        { paths: ["*.sql"], effect: "block" },
        { paths: ["src/billing/"], effect: "owner_approval" },
        { paths: ["docs/"], effect: "person_approval" },
      ]),
    );
    await expect(propose("db/schema.sql", "ESCALATE")).rejects.toThrow(/WORKSPACE_RULES_CHANGED/);
    await expect(propose("src/billing/plan.ts", "REQUIRE_APPROVAL")).rejects.toThrow(/WORKSPACE_RULES_CHANGED/);
    // With level 2 on, so the autonomy check passes and only the rules refuse it.
    await q("select public.app_set_autonomy($1, $2, 2, 3, true, false)", [org, USERS.alice]);
    await expect(propose("docs/readme.md", "ALLOW_WITHIN_LIMITS")).rejects.toThrow(/WORKSPACE_RULES_CHANGED/);
    await q("select public.app_set_autonomy($1, $2, 0, 3, true, false)", [org, USERS.alice]);
  });

  it("accepts the outcome the rules need, or anything for files they don't name", async () => {
    await expect(propose("db/schema.sql", "BLOCK")).resolves.toBeDefined();
    await expect(propose("src/billing/plan.ts", "ESCALATE")).resolves.toBeDefined();
    await expect(propose("docs/readme.md", "REQUIRE_APPROVAL")).resolves.toBeDefined();
    await expect(propose("src/app/page.tsx", "REQUIRE_APPROVAL")).resolves.toBeDefined();
  });

  it("stops checking once every rule is turned off", async () => {
    await activate(USERS.alice, set([]));
    await expect(propose("src/billing/plan.ts", "REQUIRE_APPROVAL")).resolves.toBeDefined();
  });
});
