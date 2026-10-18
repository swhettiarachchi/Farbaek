/**
 * Migration 3: versioned intent contracts, saved and approved through the
 * service-role-only functions together with their task transitions.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const asUser = <T>(uid: string, fn: () => Promise<T>) => as(db, "authenticated", uid, fn);

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

let seq = 0;
const step = (from: string, to: string, type: string) => ({ event_id: `e-${++seq}`, event_type: type, from, to });
const DRAFT_FROM_RECEIVED = () => [step("RECEIVED", "CONTEXT_ASSEMBLED", "assemble_context"), step("CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "draft_contract")];

async function newTask(title: string): Promise<string> {
  return asService(async () => {
    const r = await db.query<{ id: string }>("select public.app_create_task($1, $2, $3, $4) as id", [org, USERS.alice, project, title]);
    return r.rows[0]!.id;
  });
}

async function save(task: string, version: number, sha: string, basedOn: number, expected: number, steps: object[], actor: string = USERS.alice) {
  return asService(async () => {
    const r = await db.query<{ v: number }>("select public.app_save_contract($1, $2, $3, $4, $5, $6, $7) as v", [
      task,
      actor,
      JSON.stringify({ schema: "farbaek.intent-contract/v1", version }),
      sha,
      basedOn,
      expected,
      JSON.stringify(steps),
    ]);
    return r.rows[0]!.v;
  });
}

async function approve(task: string, version: number, sha: string, expected: number) {
  return asService(() =>
    db.query("select public.app_approve_contract($1, $2, $3, $4, $5, $6)", [
      task,
      USERS.alice,
      version,
      sha,
      expected,
      JSON.stringify([step("CONTRACT_DRAFTED", "CONTRACT_APPROVED", "approve_contract")]),
    ]),
  );
}

async function taskRow(task: string) {
  return (await asUser(USERS.alice, () => db.query<{ state: string; version: number }>("select state, version from public.tasks where id = $1", [task]))).rows[0];
}

async function contracts(task: string) {
  return (
    await asUser(USERS.alice, () =>
      db.query<{ version: number; status: string; sha256: string }>("select version, status, sha256 from public.intent_contracts where task_id = $1 order by version", [task]),
    )
  ).rows;
}

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  project = await asService(async () => {
    const r = await db.query<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]);
    return r.rows[0]!.id;
  });
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("app_save_contract", () => {
  it("stores version 1 and moves the task to Contract drafted in one step", async () => {
    const task = await newTask("Draft me");
    expect(await save(task, 1, SHA_A, 0, 0, DRAFT_FROM_RECEIVED())).toBe(1);
    expect(await taskRow(task)).toEqual({ state: "CONTRACT_DRAFTED", version: 2 });
    expect(await contracts(task)).toEqual([{ version: 1, status: "draft", sha256: SHA_A }]);
  });

  it("supersedes the previous draft on revision", async () => {
    const task = await newTask("Revise me");
    await save(task, 1, SHA_A, 0, 0, DRAFT_FROM_RECEIVED());
    expect(await save(task, 2, SHA_B, 1, 2, [step("CONTRACT_DRAFTED", "CONTRACT_DRAFTED", "revise_contract")])).toBe(2);
    expect(await contracts(task)).toEqual([
      { version: 1, status: "superseded", sha256: SHA_A },
      { version: 2, status: "draft", sha256: SHA_B },
    ]);
  });

  it("rejects an edit based on an older version, and rolls back the transitions", async () => {
    const task = await newTask("Concurrent edits");
    await save(task, 1, SHA_A, 0, 0, DRAFT_FROM_RECEIVED());
    await save(task, 2, SHA_B, 1, 2, [step("CONTRACT_DRAFTED", "CONTRACT_DRAFTED", "revise_contract")]);
    await expect(save(task, 2, SHA_A, 1, 3, [step("CONTRACT_DRAFTED", "CONTRACT_DRAFTED", "revise_contract")])).rejects.toThrow(/CONTRACT_CHANGED/);
    expect(await taskRow(task)).toEqual({ state: "CONTRACT_DRAFTED", version: 3 });
  });

  it("rejects a stale task version or steps that don't match the state", async () => {
    const task = await newTask("Stale");
    await expect(save(task, 1, SHA_A, 0, 5, DRAFT_FROM_RECEIVED())).rejects.toThrow(/VERSION_CONFLICT/);
    await expect(save(task, 1, SHA_A, 0, 0, [step("EXECUTING", "CONTRACT_DRAFTED", "draft_contract")])).rejects.toThrow(/VERSION_CONFLICT/);
    expect(await taskRow(task)).toEqual({ state: "RECEIVED", version: 0 });
  });

  it("rejects a body whose version doesn't match, and malformed hashes", async () => {
    const task = await newTask("Bad body");
    await expect(save(task, 7, SHA_A, 0, 0, DRAFT_FROM_RECEIVED())).rejects.toThrow(/INVALID_CONTRACT/);
    await expect(save(task, 1, "not-a-hash", 0, 0, DRAFT_FROM_RECEIVED())).rejects.toThrow(/check constraint/);
  });

  it("refuses non-members", async () => {
    const task = await newTask("Members only");
    await expect(save(task, 1, SHA_A, 0, 0, DRAFT_FROM_RECEIVED(), USERS.bob)).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("app_approve_contract", () => {
  it("approves the exact hash and moves the task to Contract approved", async () => {
    const task = await newTask("Approve me");
    await save(task, 1, SHA_A, 0, 0, DRAFT_FROM_RECEIVED());
    await approve(task, 1, SHA_A, 2);
    expect(await taskRow(task)).toEqual({ state: "CONTRACT_APPROVED", version: 3 });
    expect(await contracts(task)).toEqual([{ version: 1, status: "approved", sha256: SHA_A }]);
  });

  it("refuses a hash the reviewer didn't see, or an older version", async () => {
    const task = await newTask("Wrong hash");
    await save(task, 1, SHA_A, 0, 0, DRAFT_FROM_RECEIVED());
    await expect(approve(task, 1, SHA_B, 2)).rejects.toThrow(/CONTRACT_CHANGED/);
    await save(task, 2, SHA_B, 1, 2, [step("CONTRACT_DRAFTED", "CONTRACT_DRAFTED", "revise_contract")]);
    await expect(approve(task, 1, SHA_A, 3)).rejects.toThrow(/CONTRACT_CHANGED/);
    expect(await taskRow(task)).toEqual({ state: "CONTRACT_DRAFTED", version: 3 });
  });

  it("supersedes the approved version when it is revised", async () => {
    const task = await newTask("Approve then revise");
    await save(task, 1, SHA_A, 0, 0, DRAFT_FROM_RECEIVED());
    await approve(task, 1, SHA_A, 2);
    await save(task, 2, SHA_B, 1, 3, [step("CONTRACT_APPROVED", "CONTRACT_DRAFTED", "revise_contract")]);
    expect(await contracts(task)).toEqual([
      { version: 1, status: "superseded", sha256: SHA_A },
      { version: 2, status: "draft", sha256: SHA_B },
    ]);
  });
});

describe("contract grants and isolation", () => {
  it("only the server can save or approve contracts", async () => {
    await expect(asUser(USERS.alice, () => db.query("select public.app_save_contract(gen_random_uuid(), gen_random_uuid(), '{}', $1, 0, 0, '[]')", [SHA_A]))).rejects.toThrow(
      /permission denied/,
    );
    await expect(asUser(USERS.alice, () => db.query("select public.app_approve_contract(gen_random_uuid(), gen_random_uuid(), 1, $1, 0, '[]')", [SHA_A]))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("hides contracts from other organizations and blocks browser writes", async () => {
    const task = await newTask("Private contract");
    await save(task, 1, SHA_A, 0, 0, DRAFT_FROM_RECEIVED());
    const seen = await asUser(USERS.bob, () => db.query("select * from public.intent_contracts where task_id = $1", [task]));
    expect(seen.rows).toEqual([]);
    await expect(asUser(USERS.alice, () => db.query("update public.intent_contracts set status = 'approved' where task_id = $1", [task]))).rejects.toThrow(
      /permission denied/,
    );
  });
});
