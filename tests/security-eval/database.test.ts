/**
 * Boundaries the database enforces on its own (ASI03, ASI07, ASI08, ASI09,
 * ASI10, LLM06), on a real Postgres (PGlite) with every migration:
 * workspaces stay apart, desktop agents' credentials can't be reused,
 * Farbaek's AI switch stops every workspace at once, a failure after an
 * automatic apply pauses autonomy, nothing goes live without verified
 * evidence or an owner's logged reason, workspace rules can't be skipped,
 * a pause stops agents at once, level 3 keeps to its daily budget, and
 * a member can't act past the permissions an owner or admin turned off, and
 * a workflow can't run past its approval.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inspectorAddress, launchAddress } from "@/core/launch/providers";
import { compileRuleSet, parseRuleSet, ruleSetHash } from "@/core/trust/workspace-rules";
import { USERS, as, createOrg, createTestDb } from "../db/harness";

let db: PGlite;
let orgA: string;
let orgB: string;
let projectA: string;
let projectB: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const asUser = <T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) => as(db, "authenticated", uid, async () => (await db.query<T>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const H = (c: string) => c.repeat(64);
const DAY = 86_400_000;
const LIMITS = [1024 * 512, 25 * 1024 * 1024, 3000];

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `se-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
const version = async (task: string) => (await admin<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;
const latest = async (project: string) => (await admin<{ digest: string }>("select digest from public.proofpacks where project_id = $1 order by seq desc limit 1", [project]))[0]?.digest ?? null;

/** A task in org's project with an approved contract and a pending proposal; applied when `by` is given. */
async function task(org: string, actor: string, project: string, title: string, by?: "person" | "policy") {
  const id = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, actor, project, title]))[0]!.id;
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [id, actor, JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 }), H("c"), JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")])]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [id, actor, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  const path = `docs/${title.replace(/\W+/g, "-").toLowerCase()}.md`;
  const content = `# ${title}\n`;
  const proposal = (
    await q<{ id: string }>("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'm', 1, 1, $6, $7, $8, 1000, $9, $10) as id", [
      id,
      actor,
      JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
      JSON.stringify([{ path, kind: "create", base_revision: 0, content, sha256: sha(content), reason: "r" }]),
      H("b"),
      await version(id),
      JSON.stringify([step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"), step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"), step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system")]),
      JSON.stringify({ outcome: by === "policy" ? "ALLOW_WITHIN_LIMITS" : "REQUIRE_APPROVAL", version: H("e"), findings: [] }),
      new Date(Date.now() - DAY).toISOString(),
      new Date(Date.now() + DAY).toISOString(),
    ])
  )[0]!.id;
  if (by) {
    const pack = { _type: "https://in-toto.io/Statement/v1", subject: [{ name: path, digest: { sha256: sha(content) } }], predicateType: "https://farbaek.dev/proofpack/v1", predicate: { status: "unverified", proposal: { id: proposal }, approval: { appliedSha256: H("a"), ...(by === "policy" ? { by: "policy", autonomyLevel: 2 } : {}) }, previous: await latest(project), nonce: ++seq } };
    await q("select public.app_apply_proposal($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'unverified')", [
      proposal,
      actor,
      JSON.stringify([{ path, content }]),
      H("a"),
      await version(id),
      JSON.stringify([step("APPROVAL_PENDING", "EXECUTION_AUTHORIZED", "grant_approval", by === "policy" ? "system" : undefined), step("EXECUTION_AUTHORIZED", "EXECUTING", "start_execution", "system"), step("EXECUTING", "VERIFYING", "begin_verification", "system")]),
      ...LIMITS,
      JSON.stringify(pack),
      sha(JSON.stringify(pack)),
    ]);
  }
  return { task: id, proposal };
}

beforeAll(async () => {
  db = await createTestDb();
  orgA = await createOrg(db, USERS.alice, "Alice Studio");
  orgB = await createOrg(db, USERS.bob, "Bob Labs");
  projectA = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [orgA, USERS.alice]))[0]!.id;
  projectB = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Ledger', null, null) as id", [orgB, USERS.bob]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("SE-020 Reaching into another workspace", () => {
  it("can't read another workspace's work, and server functions refuse to act there", async () => {
    const b = await task(orgB, USERS.bob, projectB, "Bob's change", "person");
    for (const table of ["tasks", "change_proposals", "proofpacks", "project_files", "intent_contracts", "task_verifications", "audit_events"]) {
      const seen = await asUser<{ n: number }>(USERS.alice, `select count(*)::int as n from public.${table} where org_id = $1`, [orgB]);
      expect(seen[0]!.n, table).toBe(0);
    }
    await expect(q("select public.app_create_task($1, $2, $3, 'Planted')", [orgB, USERS.alice, projectB])).rejects.toThrow(/FORBIDDEN|NOT_FOUND/);
    await expect(q("select public.app_start_task_verification($1, $2, $3, 'person')", [orgB, USERS.alice, b.task])).rejects.toThrow(/FORBIDDEN|NOT_FOUND/);
    await expect(q("select public.app_set_autonomy($1, $2, 2, 3, true)", [orgB, USERS.alice])).rejects.toThrow(/FORBIDDEN/);
    // And the browser can't write anywhere, even in its own workspace.
    await expect(asUser(USERS.alice, "update public.tasks set state = 'VERIFIED'")).rejects.toThrow(/permission denied/);
  });
});

describe("SE-021 A desktop agent's credentials reused", () => {
  it("accepts a pairing code once, and stops a revoked agent's token at once", async () => {
    const code = "EVAL-CODE-1";
    await q("select public.app_create_agent_pairing($1, $2, $3, $4, $5)", [orgA, USERS.alice, sha(code), new Date(Date.now() + 10 * 60_000).toISOString(), 5]);
    const redeem = (token: string) => q<{ agent_id: string }>("select * from public.app_redeem_agent_pairing($1, $2, 'Eval PC', 'windows', '0.1.0', 5)", [sha(code), sha(token)]);
    const [agent] = await redeem("fa_eval_token_1");
    await expect(redeem("fa_eval_token_2")).rejects.toThrow(/PAIRING_CLOSED/);
    const session = (token: string) => q("select * from public.app_agent_session($1)", [sha(token)]);
    expect(await session("fa_eval_token_1")).toHaveLength(1);
    // Someone outside the workspace can't revoke it, or take it over.
    await expect(q("select public.app_revoke_agent($1, $2)", [agent!.agent_id, USERS.bob])).rejects.toThrow(/FORBIDDEN/);
    await q("select public.app_revoke_agent($1, $2)", [agent!.agent_id, USERS.alice]);
    expect(await session("fa_eval_token_1")).toEqual([]);
    expect(await session("fa_eval_token_2")).toEqual([]);
  });
});

describe("SE-022 Stopping AI everywhere at once", () => {
  it("refuses every workspace's usage while the AI switch is paused, and only then", async () => {
    const grant = JSON.stringify({ kind: "plan", units: 10_000, starts_at: new Date(Date.now() - DAY).toISOString(), expires_at: new Date(Date.now() + 20 * DAY).toISOString(), source_key: "plan:pro:eval" });
    const reserve = (org: string, actor: string, key: string) => q("select public.app_reserve_usage($1, $2, $3, 'agent_step', null, 10, $4)", [org, actor, key, grant]);
    await reserve(orgA, USERS.alice, "eval-before");
    await admin("update public.platform_flags set paused = true, public_message = 'Paused for an evaluation test.' where key = 'ai_runs'");
    try {
      await expect(reserve(orgA, USERS.alice, "eval-a")).rejects.toThrow(/PAUSED_BY_FARBAEK:ai_runs/);
      await expect(reserve(orgB, USERS.bob, "eval-b")).rejects.toThrow(/PAUSED_BY_FARBAEK:ai_runs/);
    } finally {
      await admin("update public.platform_flags set paused = false, public_message = null where key = 'ai_runs'");
    }
    await reserve(orgB, USERS.bob, "eval-after");
  });
});

describe("SE-023 A failure after autonomy applies a change", () => {
  const failPack = async (t: { task: string; proposal: string }, status: string) => {
    const statement = { _type: "https://in-toto.io/Statement/v1", predicate: { status, proposal: { id: t.proposal }, nonce: ++seq } };
    await admin("insert into public.proofpacks (digest, org_id, project_id, task_id, proposal_id, status, statement, previous) values ($1, $2, $3, $4, $5, $6, $7, $8)", [
      sha(JSON.stringify(statement)),
      orgA,
      projectA,
      t.task,
      t.proposal,
      status,
      JSON.stringify(statement),
      await latest(projectA),
    ]);
  };
  const suspended = async () => (await admin<{ suspended_at: string | null }>("select suspended_at from public.org_autonomy where org_id = $1", [orgA]))[0]?.suspended_at ?? null;

  it("pauses autonomy for the whole workspace after a failed or partly failed check, and refuses more automatic applies", async () => {
    for (const status of ["failed", "partially_verified"]) {
      await q("select public.app_set_autonomy($1, $2, 2, 3, true)", [orgA, USERS.alice]);
      const t = await task(orgA, USERS.alice, projectA, `Policy applied ${status}`, "policy");
      expect(await suspended()).toBeNull();
      await failPack(t, status);
      expect(await suspended(), status).not.toBeNull();
      // Work that waits for a person carries on; nothing may be allowed within limits while it's paused.
      await expect(task(orgA, USERS.alice, projectA, `Next after ${status}`)).resolves.toMatchObject({ task: expect.any(String) });
      await expect(task(orgA, USERS.alice, projectA, `Blocked after ${status}`, "policy")).rejects.toThrow(/AUTONOMY_OFF/);
    }
  });

  it("runs one verification per task at a time", async () => {
    const t = await task(orgA, USERS.alice, projectA, "One at a time", "person");
    await q("select public.app_start_task_verification($1, $2, $3, 'person')", [orgA, USERS.alice, t.task]);
    await expect(q("select public.app_start_task_verification($1, $2, $3, 'autonomy')", [orgA, USERS.alice, t.task])).rejects.toThrow(/VERIFICATION_RUNNING/);
  });
});

describe("SE-024 Deploying without evidence", () => {
  let project: string;
  const files = async () => JSON.stringify(await admin("select path, revision, sha256, size_bytes as size from public.project_files where project_id = $1 order by path", [project]));
  async function check() {
    const id = (await q<{ id: string }>("select public.app_start_security_report($1, $2, $3) as id", [orgA, USERS.alice, project]))[0]!.id;
    await q("select public.app_finish_security_report($1, 'done', 90, 'A', $2, $3, $4, null)", [id, JSON.stringify({ critical: 0, high: 0, medium: 0, low: 0, info: 0 }), JSON.stringify({ predicateType: "https://farbaek.dev/security-report/v1", predicate: {} }), H("c")]);
    return id;
  }
  const publish = async (actor: string, reason: string | null) =>
    (await q<{ id: string }>("select public.app_publish_site($1, $2, $3, 'launch-eval', $4, $5, $6, $7) as id", [orgA, actor, project, await files(), H("d"), await check(), reason]))[0]!.id;
  const recorded = async (id: string) => ({
    ...(await admin("select evidence, override_reason from public.site_deployments where id = $1", [id]))[0],
    audit: (await admin<{ metadata: Record<string, unknown> }>("select metadata from public.audit_events where target = $1 and action = 'site.published'", [id]))[0]!.metadata,
  });

  beforeAll(async () => {
    project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Launch', null, null) as id", [orgA, USERS.alice]))[0]!.id;
    await q("select public.app_import_files($1, $2, $3, 524288, 4194304, 26214400, 3000)", [project, USERS.alice, JSON.stringify([{ path: "index.html", content: "<h1>Launch</h1>" }])]);
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [orgA, USERS.unverified]);
  });

  it("refuses to publish an unverified change unless an owner or admin says why, and records the reason", async () => {
    await task(orgA, USERS.alice, project, "Launch copy", "person");
    await expect(publish(USERS.alice, null)).rejects.toThrow(/EVIDENCE_REQUIRED/);
    await expect(publish(USERS.unverified, "The agent said it was fine.")).rejects.toThrow(/OVERRIDE_FORBIDDEN/);
    const id = await publish(USERS.alice, "Checked the page by hand before launch.");
    expect(await recorded(id)).toMatchObject({ evidence: "unverified", override_reason: "Checked the page by hand before launch.", audit: { evidence: "unverified", override: "Checked the page by hand before launch." } });
  });

  it("publishes without a reason only once a check run verified that exact change", async () => {
    const change = (await latest(project))!;
    const statement = { _type: "https://in-toto.io/Statement/v1", predicate: { status: "verified", verification: { receipt: H("7"), appliedProofPack: change }, nonce: ++seq } };
    const t = (await admin<{ task_id: string }>("select task_id from public.proofpacks where digest = $1", [change]))[0]!.task_id;
    await admin("insert into public.proofpacks (digest, org_id, project_id, task_id, status, statement, previous) values ($1, $2, $3, $4, 'verified', $5, $6)", [sha(JSON.stringify(statement)), orgA, project, t, JSON.stringify(statement), change]);
    const id = await publish(USERS.unverified, null);
    expect(await recorded(id)).toMatchObject({ evidence: "verified", override_reason: null, audit: { evidence: "verified", override: null } });
  });
});

describe("SE-025 A workspace rule bypassed", () => {
  const ruleSet = async (rules: { paths: string[]; effect: string }[]) => {
    const parsed = parseRuleSet({ rules: rules.map((r, i) => ({ id: `r${i + 1}`, reason: "Docs need an owner.", ...r })) });
    if (!parsed.ok) throw new Error("rules");
    const sha256 = await ruleSetHash(parsed.set);
    return { document: JSON.stringify(parsed.set), compiled: JSON.stringify(compileRuleSet(parsed.set)), sha256, tested: JSON.stringify({ sha256, changes: 0 }) };
  };
  const activate = async (actor: string, org: string, rules: { paths: string[]; effect: string }[]) => {
    const r = await ruleSet(rules);
    return q("select public.app_activate_workspace_rules($1, $2, $3, $4, $5, $6)", [org, actor, r.document, r.compiled, r.sha256, r.tested]);
  };

  it("refuses a change to protected files unless its outcome is as strict as the rule asks, whoever made it", async () => {
    await activate(USERS.alice, orgA, [{ paths: ["docs/"], effect: "owner_approval" }]);
    try {
      // The task helper decides every change as needing only a contributor, as a path that skipped the rules would.
      await expect(task(orgA, USERS.alice, projectA, "Rules skipped")).rejects.toThrow(/WORKSPACE_RULES_CHANGED/);
      // Another workspace's changes aren't touched by these rules.
      await expect(task(orgB, USERS.bob, projectB, "Other workspace")).resolves.toMatchObject({ task: expect.any(String) });
    } finally {
      await activate(USERS.alice, orgA, []);
    }
    await expect(task(orgA, USERS.alice, projectA, "Rules off")).resolves.toMatchObject({ task: expect.any(String) });
  });

  it("lets only an owner or admin of that workspace change its rules, and never from a browser", async () => {
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member') on conflict do nothing", [orgA, USERS.unverified]);
    await expect(activate(USERS.unverified, orgA, [])).rejects.toThrow(/FORBIDDEN/);
    await expect(activate(USERS.bob, orgA, [])).rejects.toThrow(/FORBIDDEN/);
    const r = await ruleSet([]);
    await expect(asUser(USERS.alice, "select public.app_activate_workspace_rules($1, $2, $3, $4, $5, $6)", [orgA, USERS.alice, r.document, r.compiled, r.sha256, r.tested])).rejects.toThrow(/permission denied/);
  });
});

describe("SE-026 An agent that won't stop", () => {
  const pause = (actor: string, paused: boolean) => q("select public.app_set_agents_pause($1, $2, $3, 'Evaluation')", [orgA, actor, paused]);

  it("stops new runs and automatic applies at once when anyone who contributes pauses, but not people's own work", async () => {
    await q("select public.app_set_autonomy($1, $2, 2, 3, true)", [orgA, USERS.alice]);
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member') on conflict do nothing", [orgA, USERS.unverified]);
    await pause(USERS.unverified, true);
    try {
      const t = (await admin<{ id: string }>("select id from public.tasks where org_id = $1 limit 1", [orgA]))[0]!.id;
      // Checked before anything else about the row: a paused workspace starts no run at all.
      await expect(admin("insert into public.agent_runs (org_id, task_id, project_id, started_by, effort) values ($1, $2, $3, $4, 'fast')", [orgA, t, projectA, USERS.alice])).rejects.toThrow(/AGENTS_PAUSED/);
      await expect(task(orgA, USERS.alice, projectA, "Applies on its own while paused", "policy")).rejects.toThrow(/AGENTS_PAUSED/);
      await expect(task(orgA, USERS.alice, projectA, "A person's change while paused")).resolves.toMatchObject({ task: expect.any(String) });
      // Only an owner or admin resumes.
      await expect(pause(USERS.unverified, false)).rejects.toThrow(/FORBIDDEN/);
    } finally {
      await pause(USERS.alice, false);
    }
    await expect(task(orgA, USERS.alice, projectA, "Applies on its own after resuming", "policy")).resolves.toMatchObject({ task: expect.any(String) });
  });
});

describe("SE-027 Autonomy beyond its budget", () => {
  it("won't turn level 3 on without a clean record of changes applied on their own", async () => {
    await expect(q("select public.app_set_autonomy($1, $2, 3, 8, true, false, 10)", [orgB, USERS.bob])).rejects.toThrow(/AUTONOMY_NOT_EARNED/);
  });

  it("refuses an automatic apply once the day's budget is spent, whatever the server decided", async () => {
    const today = async () =>
      (await admin<{ n: number }>("select count(*)::int as n from public.change_proposals where org_id = $1 and policy ->> 'outcome' = 'ALLOW_WITHIN_LIMITS' and created_at >= now() - interval '24 hours'", [orgA]))[0]!.n;
    // Set straight in the table, as if earned: the budget is what's under test here.
    await admin("update public.org_autonomy set level = 3, max_files = 8, daily_limit = $2, suspended_at = null, suspended_reason = null where org_id = $1", [orgA, (await today()) + 1]);
    try {
      await expect(task(orgA, USERS.alice, projectA, "Within the budget", "policy")).resolves.toMatchObject({ task: expect.any(String) });
      await expect(task(orgA, USERS.alice, projectA, "Past the budget", "policy")).rejects.toThrow(/AUTONOMY_DAILY_LIMIT/);
      await expect(task(orgA, USERS.alice, projectA, "A person's change past the budget")).resolves.toMatchObject({ task: expect.any(String) });
    } finally {
      await admin("update public.org_autonomy set level = 2, max_files = 3, daily_limit = null where org_id = $1", [orgA]);
    }
  });
});

describe("SE-028 A member acting beyond their permissions", () => {
  it("refuses a person's approval and an agent run from a member who had them turned off, and only owners and admins change that", async () => {
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member') on conflict do nothing", [orgA, USERS.bob]);
    try {
      await expect(q("select public.app_set_member_permissions($1, $2, $3, $4)", [orgA, USERS.bob, USERS.bob, JSON.stringify({ approve: true })])).rejects.toThrow(/FORBIDDEN/);
      await expect(asUser(USERS.bob, "update public.organization_members set permissions = '{}' where user_id = $1", [USERS.bob])).rejects.toThrow(/permission denied/);
      await q("select public.app_set_member_permissions($1, $2, $3, $4)", [orgA, USERS.alice, USERS.bob, JSON.stringify({ approve: false, run_agents: false })]);
      await expect(task(orgA, USERS.bob, projectA, "Approved by a member without it", "person")).rejects.toThrow(/PERMISSION_WITHHELD/);
      const t = await task(orgA, USERS.alice, projectA, "Built by a member without it");
      await q("select public.app_discard_proposal($1, $2, $3, $4)", [t.proposal, USERS.alice, await version(t.task), JSON.stringify([step("APPROVAL_PENDING", "CONTRACT_APPROVED", "discard_plan")])]);
      await expect(q("select public.app_start_agent_run($1, $2, $3, 'balanced', 'sandboxed', 1, $4)", [orgA, USERS.bob, t.task, H("c")])).rejects.toThrow(/PERMISSION_WITHHELD/);
      // An owner's own work goes on as before.
      await expect(task(orgA, USERS.alice, projectA, "Approved by an owner", "person")).resolves.toMatchObject({ task: expect.any(String) });
    } finally {
      await admin("delete from public.organization_members where org_id = $1 and user_id = $2", [orgA, USERS.bob]);
    }
  });
});

describe("SE-029 A workflow running past its approval", () => {
  it("won't start a step before approval, after cancelling, while paused, or past a checkpoint no one released", async () => {
    const create = async () => {
      const wf = (await q<{ id: string }>("select public.app_create_workflow($1, $2, $3, 'Eval workflow', $4, 2000) as id", [orgA, USERS.alice, projectA, JSON.stringify([{ title: "First step", checkpoint: true }, { title: "Second step" }])]))[0]!.id;
      return wf;
    };
    const claim = async (wf: string) => (await q<{ result: string }>("select result from public.app_workflow_claim_next($1)", [wf]))[0]!.result;
    const approveAll = async (wf: string) => {
      for (const s of await admin<{ task_id: string }>("select task_id from public.workflow_steps where workflow_id = $1 order by position", [wf])) {
        await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [s.task_id, USERS.alice, JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 }), H("c"), JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")])]);
        await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [s.task_id, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
      }
      await q("select public.app_approve_workflow($1, $2, $3)", [wf, USERS.alice, H("a")]);
    };

    const draft = await create();
    expect(await claim(draft)).toBe("draft");

    const wf = await create();
    await approveAll(wf);
    await admin("update public.organizations set agents_paused_at = now(), agents_paused_by = $2, agents_paused_reason = 'Evaluating the pause.' where id = $1", [orgA, USERS.alice]);
    try {
      expect(await claim(wf)).toBe("paused");
    } finally {
      await admin("update public.organizations set agents_paused_at = null, agents_paused_by = null, agents_paused_reason = null where id = $1", [orgA]);
    }
    expect(await claim(wf)).toBe("started");
    await q("select public.app_workflow_step_result($1, 1::smallint, 'verified', null)", [wf]);
    expect(await claim(wf)).toBe("checkpoint");
    expect(await claim(wf)).toBe("waiting");
    await q("select public.app_cancel_workflow($1, $2)", [wf, USERS.alice]);
    expect(await claim(wf)).toBe("cancelled");
    // And a browser can't move a workflow on at all.
    await expect(asUser(USERS.alice, "select public.app_workflow_claim_next($1)", [wf])).rejects.toThrow(/permission denied/);
  });
});

describe("SE-030 A launch address outside the host's own domain", () => {
  it("keeps a Netlify launch's address and link on Netlify, in the database and before Farbaek links to it", async () => {
    await admin("update public.launch_orders set status = 'failed', failure = 'x', finished_at = now() where project_id = $1 and status not in ('ready', 'failed')", [projectB]);
    await q("select public.app_connect_provider($1, $2, 'netlify', 'acc_1', 'Bob', null, $3, null)", [orgB, USERS.bob, `v1.k1.${"A".repeat(60)}`]);
    const order = (await q<{ id: string }>("select public.app_authorize_launch($1, $2, $3, 'netlify', $4, 'ledger', $5, 1, 10, 'Evaluating launch addresses here.') as id", [orgB, USERS.bob, projectB, crypto.randomUUID(), H("d")]))[0]!.id;
    const update = (url: string | null, inspector: string | null) => q("select public.app_update_launch_order($1, 'building', 'dep_1', $2, $3, null)", [order, url, inspector]);
    for (const url of ["https://ledger.vercel.app", "https://ledger.netlify.app.evil.example", "http://ledger.netlify.app", "https://evil.example"]) {
      await expect(update(url, null)).rejects.toThrow(/launch_orders_url_check/);
      expect(launchAddress("netlify", url)).toBeNull();
    }
    for (const link of ["https://vercel.com/bob/ledger", "https://app.netlify.com.evil.example/x"]) {
      await expect(update(null, link)).rejects.toThrow(/launch_orders_inspector_url_check/);
      expect(inspectorAddress("netlify", link)).toBeNull();
    }
    await update("https://ledger.netlify.app", "https://app.netlify.com/sites/ledger/deploys/dep_1");
    expect(launchAddress("netlify", "https://ledger.netlify.app")).toBe("https://ledger.netlify.app");
  });
});

describe("SE-042 A guest reaching past their one project", () => {
  it("reads and edits only that project, and never spends, approves, applies or checks", async () => {
    const carol = "00000000-0000-4000-8000-0000000ca242";
    await admin("insert into auth.users (id, email, email_confirmed_at) values ($1, 'carol.guest@example.test', now())", [carol]);
    const backOffice = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Back office', null, null) as id", [orgA, USERS.alice]))[0]!.id;
    await q("select public.app_save_file($1, $2, 'secret-plan.md', 'not for guests', 0, $3, $4, $5)", [backOffice, USERS.alice, ...LIMITS]);
    const token = "se-042-invite-token";
    await q("select public.app_create_project_invitation($1, $2, 'carol.guest@example.test', 'edit', $3, now() + interval '7 days', 10)", [projectA, USERS.alice, sha(token)]);
    await q("select public.app_accept_project_invitation($1, $2, 10)", [sha(token), carol]);

    // Reads: that project only, and none of the workspace around it.
    const projects = await asUser<{ id: string }>(carol, "select id from public.projects");
    expect(projects.map((p) => p.id)).toEqual([projectA]);
    for (const table of ["organizations", "organization_members", "audit_events", "ai_credit_ledger", "launch_orders", "agent_runs", "sandbox_sessions"]) {
      expect(await asUser(carol, `select 1 from public.${table}`), table).toEqual([]);
    }
    expect(await asUser(carol, "select 1 from public.project_files where project_id = $1", [backOffice])).toEqual([]);

    // Writes: files and tasks in that project; nothing else.
    await q("select public.app_save_file($1, $2, 'notes/guest.md', 'hello', 0, $3, $4, $5)", [projectA, carol, ...LIMITS]);
    await expect(q("select public.app_save_file($1, $2, 'secret-plan.md', 'changed', 1, $3, $4, $5)", [backOffice, carol, ...LIMITS])).rejects.toThrow(/FORBIDDEN/);
    const t = await task(orgA, USERS.alice, projectA, "Guest refusals");
    await expect(q("select public.app_approve_contract($1, $2, 1, $3, 2, '[]')", [t.task, carol, H("c")])).rejects.toThrow();
    await expect(q("select public.app_start_task_verification($1, $2, $3, 'person')", [orgA, carol, t.task])).rejects.toThrow(/FORBIDDEN|NOT_FOUND/);
    await expect(q("select public.app_reserve_usage($1, $2, 'se-042', 'contract_draft', $3, 10, '{}'::jsonb)", [orgA, carol, t.task])).rejects.toThrow();
    await expect(q("select public.app_import_files($1, $2, '[{\"path\":\"x.md\",\"content\":\"x\"}]'::jsonb, $3, 4194304, $4, $5)", [projectA, carol, ...LIMITS])).rejects.toThrow(/FORBIDDEN/);
    await expect(q("select public.app_archive_project($1, $2)", [projectA, carol])).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("SE-043 A read-only link turned off, or reaching history", () => {
  it("stops at once when turned off, never serves history, and is never callable from a browser", async () => {
    const token = "se-043-link-token";
    await q("select public.app_save_file($1, $2, 'gone.md', 'deleted later', 0, $3, $4, $5)", [projectA, USERS.alice, ...LIMITS]);
    await q("select public.app_delete_file($1, $2, 'gone.md', 1)", [projectA, USERS.alice]);
    const link = (await q<{ id: string }>("select public.app_create_share_link($1, $2, $3, null, false) as id", [projectA, USERS.alice, sha(token)]))[0]!.id;
    expect((await q<{ v: { state: string } }>("select public.app_project_for_share($1) as v", [sha(token)]))[0]!.v.state).toBe("live");
    // A deleted file stays in history, and history isn't reachable through a link.
    expect(await q("select 1 from public.app_share_file($1, 'gone.md')", [sha(token)])).toEqual([]);
    for (const role of ["anon", "authenticated"] as const) {
      await expect(as(db, role, role === "anon" ? null : USERS.alice, () => db.query("select public.app_share_file($1, 'notes/guest.md')", [sha(token)]))).rejects.toThrow(/permission denied/);
    }
    await q("select public.app_revoke_share_link($1, $2)", [link, USERS.alice]);
    expect((await q<{ v: { state: string } }>("select public.app_project_for_share($1) as v", [sha(token)]))[0]!.v).toEqual({ state: "revoked" });
    expect(await q("select 1 from public.app_share_file($1, 'notes/guest.md')", [sha(token)])).toEqual([]);
  });
});
