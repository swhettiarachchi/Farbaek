/**
 * Migration 14: paired desktop agents. Codes and tokens are stored as hashes
 * only; a code works once within its expiry and the plan's agent limit; an
 * agent acts only for the contributor who paired it; its proposals go
 * through app_create_proposal and carry its id.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;
let project: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
/** As the database owner, for setup and for private functions no API role can call. */
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const H = (c: string) => c.repeat(64);
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const DAY = 86_400_000;

let n = 0;
async function pairingCode(opts: { actor?: string; limit?: number | null; org?: string; minutes?: number } = {}) {
  const code = `CODE-${++n}`;
  await q("select public.app_create_agent_pairing($1, $2, $3, $4, $5)", [opts.org ?? org, opts.actor ?? USERS.alice, sha(code), inMinutes(opts.minutes ?? 10), opts.limit === undefined ? 5 : opts.limit]);
  return code;
}

async function redeem(code: string, opts: { limit?: number | null; name?: string } = {}) {
  const token = `fa_token_${++n}`;
  const rows = await q<{ agent_id: string; org_id: string }>("select * from public.app_redeem_agent_pairing($1, $2, $3, 'windows', '0.1.0', $4)", [
    sha(code),
    sha(token),
    opts.name ?? "Office PC",
    opts.limit === undefined ? 5 : opts.limit,
  ]);
  return { ...rows[0]!, token };
}

const session = (token: string) => q<{ agent_id: string; org_id: string; user_id: string; role: string | null; name: string }>("select * from public.app_agent_session($1)", [sha(token)]);

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system", actor_id?: string) => ({
  event_id: `e-${++seq}`,
  event_type: type,
  from,
  to,
  ...(actor_kind ? { actor_kind, actor_id: actor_id ?? "farbaek" } : {}),
});

async function approvedTask(title: string): Promise<string> {
  const id = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, title]))[0]!.id;
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [
    id,
    USERS.alice,
    JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 }),
    H("c"),
    JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")]),
  ]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [id, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  return id;
}

async function agentPropose(agent: string, task: string, opts: { actor?: string; agentStepId?: string } = {}) {
  const version = (await q<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;
  const content = "# Readme\nRun pnpm test.\n";
  const rows = await q<{ id: string }>(
    "select public.app_create_agent_proposal($1, $2, $3, 1, $4, $5, '[]', '[]', $6, 'claude-opus-5-5', 100, 50, $7, $8, $9, 1000, $10, $11) as id",
    [
      agent,
      task,
      opts.actor ?? USERS.alice,
      JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
      JSON.stringify([{ path: "README.md", kind: "edit", base_revision: 1, content, sha256: sha(content), reason: "r" }]),
      H("b"),
      version,
      JSON.stringify([
        step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent", opts.agentStepId ?? `agent:${agent}`),
        step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"),
        step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system"),
      ]),
      JSON.stringify({ outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [] }),
      new Date(Date.now() - DAY).toISOString(),
      new Date(Date.now() + DAY).toISOString(),
    ],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  otherOrg = await createOrg(db, USERS.bob, "Bob Labs");
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]))[0]!.id;
  await q("select public.app_import_files($1, $2, $3, 524288, 4194304, 26214400, 3000)", [project, USERS.alice, JSON.stringify([{ path: "README.md", content: "# Readme\n" }])]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("pairing", () => {
  it("redeems a code once and stores only hashes", async () => {
    const code = await pairingCode();
    const agent = await redeem(code);
    expect(agent.org_id).toBe(org);
    await expect(redeem(code)).rejects.toThrow(/PAIRING_CLOSED/);
    await expect(redeem("never-issued")).rejects.toThrow(/NOT_FOUND/);
    const stored = await q<{ token_sha256: string; name: string; paired_by: string }>("select token_sha256, name, paired_by from public.agents where id = $1", [agent.agent_id]);
    expect(stored[0]).toEqual({ token_sha256: sha(agent.token), name: "Office PC", paired_by: USERS.alice });
    expect(JSON.stringify(await q("select * from public.agent_pairings"))).not.toContain(code);
    expect(await q("select 1 from public.audit_events where action = 'agent.paired' and target = $1", [agent.agent_id])).toHaveLength(1);
  });

  it("refuses expired codes and codes valid for more than 15 minutes", async () => {
    await expect(pairingCode({ minutes: 20 })).rejects.toThrow(/INVALID_PAIRING/);
    const code = await pairingCode();
    await admin("update public.agent_pairings set created_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute' where code_sha256 = $1", [sha(code)]);
    await expect(redeem(code)).rejects.toThrow(/PAIRING_CLOSED/);
  });

  it("keeps one open code per person: a new one replaces the old", async () => {
    const first = await pairingCode();
    await pairingCode();
    await expect(redeem(first)).rejects.toThrow(/NOT_FOUND/);
  });

  it("only lets contributors pair, and checks the plan's agent limit on create and on redeem", async () => {
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'viewer')", [otherOrg, USERS.alice]);
    await expect(pairingCode({ org: otherOrg })).rejects.toThrow(/FORBIDDEN/);
    const active = (await admin<{ n: number }>("select private.active_agents($1) as n", [org]))[0]!.n;
    await expect(pairingCode({ limit: active })).rejects.toThrow(/AGENT_LIMIT/);
    const code = await pairingCode({ limit: active + 1 });
    await expect(redeem(code, { limit: active })).rejects.toThrow(/AGENT_LIMIT/);
    expect((await redeem(code, { limit: null })).org_id).toBe(org);
  });
});

describe("agent sessions", () => {
  it("resolves a token to the agent and its person's current role, and stops after revoke", async () => {
    const agent = await redeem(await pairingCode());
    expect(await session(agent.token)).toEqual([{ agent_id: agent.agent_id, org_id: org, user_id: USERS.alice, role: "owner", name: "Office PC" }]);
    expect((await q<{ last_seen_at: string | null }>("select last_seen_at from public.agents where id = $1", [agent.agent_id]))[0]!.last_seen_at).not.toBeNull();
    expect(await session("fa_unknown")).toEqual([]);

    // Bob isn't in Alice's workspace, so he can't revoke her agent.
    await expect(q("select public.app_revoke_agent($1, $2)", [agent.agent_id, USERS.bob])).rejects.toThrow(/FORBIDDEN/);
    await q("select public.app_revoke_agent($1, $2)", [agent.agent_id, USERS.alice]);
    expect(await session(agent.token)).toEqual([]);
    await expect(q("select public.app_revoke_agent($1, $2)", [agent.agent_id, USERS.alice])).rejects.toThrow(/AGENT_REVOKED/);
  });

  it("never lets a browser read token hashes or pairing codes", async () => {
    const asAlice = <T>(fn: () => Promise<T>) => as(db, "authenticated", USERS.alice, fn);
    const rows = await asAlice(async () => (await db.query<{ name: string }>("select name from public.agents where org_id = $1", [org])).rows);
    expect(rows.length).toBeGreaterThan(0);
    await expect(asAlice(() => db.query("select token_sha256 from public.agents"))).rejects.toThrow(/permission denied/);
    await expect(asAlice(() => db.query("select * from public.agent_pairings"))).rejects.toThrow(/permission denied/);
    await expect(asAlice(() => db.query("select public.app_agent_session('x')"))).rejects.toThrow(/permission denied/);
    // Bob isn't a member of Alice's workspace and sees none of its agents.
    const bobs = await as(db, "authenticated", USERS.bob, async () => (await db.query("select id from public.agents where org_id = $1", [org])).rows);
    expect(bobs).toEqual([]);
  });
});

describe("agent proposals", () => {
  it("go through the normal proposal path and carry the agent's id", async () => {
    const agent = await redeem(await pairingCode());
    const task = await approvedTask("Document the tests");
    const proposal = await agentPropose(agent.agent_id, task);
    const row = (await q<{ agent_id: string; status: string; created_by: string }>("select agent_id, status, created_by from public.change_proposals where id = $1", [proposal]))[0]!;
    expect(row).toEqual({ agent_id: agent.agent_id, status: "pending", created_by: USERS.alice });
    const steps = await q<{ actor_kind: string; actor_id: string }>("select actor_kind, actor_id from public.task_transitions where task_id = $1 and event_type = 'propose_plan'", [task]);
    expect(steps).toEqual([{ actor_kind: "agent", actor_id: `agent:${agent.agent_id}` }]);
    expect(await q("select 1 from public.evaluation_events where idempotency_key = $1", [`change_proposal:${proposal}`])).toHaveLength(1);
  });

  it("refuse revoked agents, other people, other workspaces and steps that name another agent", async () => {
    const agent = await redeem(await pairingCode());
    const task = await approvedTask("Another task");
    await expect(agentPropose(agent.agent_id, task, { actor: USERS.bob })).rejects.toThrow(/FORBIDDEN/);
    await expect(agentPropose(agent.agent_id, task, { agentStepId: "farbaek-agent" })).rejects.toThrow(/INVALID_PROPOSAL/);

    const bobProject = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Bob app', null, null) as id", [otherOrg, USERS.bob]))[0]!.id;
    const bobTask = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, 'Bob task') as id", [otherOrg, USERS.bob, bobProject]))[0]!.id;
    await expect(agentPropose(agent.agent_id, bobTask)).rejects.toThrow(/FORBIDDEN/);

    await q("select public.app_revoke_agent($1, $2)", [agent.agent_id, USERS.alice]);
    await expect(agentPropose(agent.agent_id, task)).rejects.toThrow(/AGENT_REVOKED/);
  });

  it("stop working for a person who is no longer a contributor", async () => {
    await admin("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
    const code = await pairingCode({ actor: USERS.bob });
    const agent = await redeem(code);
    expect((await session(agent.token))[0]!.role).toBe("member");
    await admin("update public.organization_members set role = 'viewer' where org_id = $1 and user_id = $2", [org, USERS.bob]);
    expect((await session(agent.token))[0]!.role).toBe("viewer");
    const task = await approvedTask("Third task");
    await expect(agentPropose(agent.agent_id, task, { actor: USERS.bob })).rejects.toThrow(/FORBIDDEN/);
  });
});
