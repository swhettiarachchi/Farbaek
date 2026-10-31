/**
 * Migration v85: reading pull requests back from GitHub (ADR 0143). Only the
 * server records what GitHub said, a state that adds up and checks in
 * the expected shape, or why it couldn't read it; becoming merged or
 * closed is audited once.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const asUser = <T>(uid: string, fn: () => Promise<T>) => as(db, "authenticated", uid, fn);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => asService(async () => (await db.query<T>(sql, params)).rows);
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const H = (c: string) => c.repeat(64);
const DAY = 86_400_000;

let seq = 0;
const step = (from: string, to: string, type: string, actor_kind?: "agent" | "system") => ({ event_id: `ps-${++seq}`, event_type: type, from, to, ...(actor_kind ? { actor_kind, actor_id: "farbaek" } : {}) });
const version = async (task: string) => (await admin<{ version: number }>("select version from public.tasks where id = $1", [task]))[0]!.version;

/** A task with an approved contract and a proposal waiting for review. */
async function pending(title: string) {
  const task = (await q<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, title]))[0]!.id;
  await q("select public.app_save_contract($1, $2, $3, $4, 0, 0, $5)", [
    task,
    USERS.alice,
    JSON.stringify({ schema: "farbaek.intent-contract/v1", version: 1 }),
    H("c"),
    JSON.stringify([step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")]),
  ]);
  await q("select public.app_approve_contract($1, $2, 1, $3, 2, $4)", [task, USERS.alice, H("c"), JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")])]);
  const content = `export const name = ${JSON.stringify(title)};\n`;
  const proposal = (
    await q<{ id: string }>("select public.app_create_proposal($1, $2, 1, $3, $4, '[]', '[]', $5, 'm', 1, 1, $6, $7, $8, 1000, $9, $10) as id", [
      task,
      USERS.alice,
      JSON.stringify({ summary: "s", steps: [], risks: [], checks: [] }),
      JSON.stringify([{ path: `src/${++seq}.ts`, kind: "create", base_revision: 0, content, sha256: sha(content), reason: "r" }]),
      H("b"),
      await version(task),
      JSON.stringify([step("CONTRACT_APPROVED", "PLAN_PROPOSED", "propose_plan", "agent"), step("PLAN_PROPOSED", "POLICY_EVALUATED", "evaluate_policy", "system"), step("POLICY_EVALUATED", "APPROVAL_PENDING", "require_approval", "system")]),
      JSON.stringify({ outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [] }),
      new Date(Date.now() - DAY).toISOString(),
      new Date(Date.now() + DAY).toISOString(),
    ])
  )[0]!.id;
  return { task, proposal };
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

let pulls = 0;
/** A pull request row as the server records one when it opens it (migration v77). */
async function openPull() {
  const { task, proposal } = await pending(`Pull ${++pulls}`);
  return (
    await admin<{ id: string }>(
      "insert into public.github_pull_requests (org_id, project_id, task_id, proposal_id, repo_full_name, number, url, branch, base_branch, commit_sha, opened_by) values ($1, $2, $3, $4, 'alice/shop', $5, $6, $7, 'main', $8, $9) returning id",
      [org, project, task, proposal, pulls, `https://github.com/alice/shop/pull/${pulls}`, `farbaek/change-${pulls}`, "a".repeat(40), USERS.alice],
    )
  )[0]!.id;
}
const sync = (id: string, state: string | null, mergedAt: string | null, checks: unknown = null, problem: string | null = null) =>
  q("select public.app_sync_github_pull($1, $2, $3, $4, $5, $6)", [id, state, mergedAt, state ? "b".repeat(40) : null, checks === null ? null : JSON.stringify(checks), problem]);
const CHECKS = { total: 2, passed: 1, failed: 1, pending: 0, runs: [{ name: "test", result: "passed" }, { name: "lint", result: "failed" }] };

describe("reading pull requests back from GitHub", () => {
  it("records the state and checks, and writes the audit event once when it's merged", async () => {
    const id = await openPull();
    await sync(id, "open", null, CHECKS);
    expect((await admin<{ pr_state: string; checks: { failed: number }; synced_at: string | null }>("select pr_state, checks, synced_at from public.github_pull_requests where id = $1", [id]))[0]).toMatchObject({ pr_state: "open", checks: { failed: 1 } });
    await sync(id, "merged", "2026-10-31T09:00:00Z", CHECKS);
    await sync(id, "merged", "2026-10-31T09:00:00Z", CHECKS);
    const events = await admin<{ action: string; actor_id: string | null }>("select action, actor_id from public.audit_events where action like 'github.pull_%' and target = (select task_id::text from public.github_pull_requests where id = $1)", [id]);
    expect(events).toEqual([{ action: "github.pull_merged", actor_id: null }]);
  });

  it("refuses a state that doesn't add up, and malformed checks", async () => {
    const id = await openPull();
    await expect(sync(id, "merged", null)).rejects.toThrow(/INVALID_REQUEST/);
    await expect(sync(id, "open", "2026-10-31T09:00:00Z")).rejects.toThrow(/INVALID_REQUEST/);
    await expect(sync(id, "reopened", null)).rejects.toThrow(/INVALID_REQUEST/);
    await expect(sync(id, "open", null, { ...CHECKS, runs: [{ name: "test", result: "green" }] })).rejects.toThrow(/INVALID_REQUEST/);
    await expect(sync(id, "open", null, { total: 1 })).rejects.toThrow(/INVALID_REQUEST/);
  });

  it("keeps why it couldn't be read without touching what was read before", async () => {
    const id = await openPull();
    await sync(id, "open", null, CHECKS);
    await sync(id, null, null, null, "GitHub refused the workspace's token.");
    expect((await admin<{ pr_state: string; sync_problem: string }>("select pr_state, sync_problem from public.github_pull_requests where id = $1", [id]))[0]).toEqual({ pr_state: "open", sync_problem: "GitHub refused the workspace's token." });
    await sync(id, "closed", null);
    expect((await admin<{ pr_state: string; sync_problem: string | null }>("select pr_state, sync_problem from public.github_pull_requests where id = $1", [id]))[0]).toEqual({ pr_state: "closed", sync_problem: null });
  });

  it("is the server's alone, and members read what it recorded", async () => {
    const id = await openPull();
    await expect(asUser(USERS.alice, () => db.query("select public.app_sync_github_pull($1, 'open', null, null, null, null)", [id]))).rejects.toThrow(/permission denied/);
    await sync(id, "open", null, CHECKS);
    expect((await asUser(USERS.alice, () => db.query<{ pr_state: string }>("select pr_state from public.github_pull_requests where id = $1", [id]))).rows).toEqual([{ pr_state: "open" }]);
    expect((await asUser(USERS.bob, () => db.query("select pr_state from public.github_pull_requests where id = $1", [id]))).rows).toEqual([]);
  });
});
