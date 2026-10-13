/**
 * Migration 4: the AI credit ledger. Credits are reserved under a lock,
 * then settled or refunded exactly once, and only the server can write.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let bobOrg: string;
let task: string;

const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);
const asUser = <T>(uid: string, fn: () => Promise<T>) => as(db, "authenticated", uid, fn);

const DAY = 86_400_000;
const start = () => new Date(Date.now() - DAY).toISOString();
const end = () => new Date(Date.now() + DAY).toISOString();

let seq = 0;
async function reserve(opts: { org?: string; actor?: string; key?: string; credits?: number; limit?: number | null; task?: string | null; from?: string; to?: string } = {}) {
  return asService(async () => {
    const r = await db.query<{ id: string }>("select public.app_reserve_ai_credits($1, $2, $3, 'contract_draft', $4, $5, $6, $7, $8) as id", [
      opts.org ?? org,
      opts.actor ?? USERS.alice,
      opts.key ?? `key-${++seq}`,
      opts.task === undefined ? task : opts.task,
      opts.credits ?? 1,
      opts.limit === undefined ? 100 : opts.limit,
      opts.from ?? start(),
      opts.to ?? end(),
    ]);
    return r.rows[0]!.id;
  });
}

async function settle(entry: string, status: string, owner = org) {
  return asService(() => db.query("select public.app_settle_ai_credits($1, $2, $3, 'claude-opus-5-5', 1200, 800)", [owner, entry, status]));
}

async function used(uid: string = USERS.alice, owner = org): Promise<number> {
  const r = await asUser(uid, () => db.query<{ n: number }>("select public.ai_credits_used($1, $2, $3) as n", [owner, start(), end()]));
  return r.rows[0]!.n;
}

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  bobOrg = await createOrg(db, USERS.bob, "Bob Labs");
  task = await asService(async () => {
    const p = await db.query<{ id: string }>("select public.app_create_project($1, $2, 'Storefront', null, null) as id", [org, USERS.alice]);
    const t = await db.query<{ id: string }>("select public.app_create_task($1, $2, $3, 'Fix the hero') as id", [org, USERS.alice, p.rows[0]!.id]);
    return t.rows[0]!.id;
  });
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("reserving AI credits", () => {
  it("records a reservation that counts against the allowance", async () => {
    const before = await used();
    await reserve();
    expect(await used()).toBe(before + 1);
  });

  it("refuses a reservation that would go over the limit", async () => {
    const current = await used();
    await expect(reserve({ credits: 2, limit: current + 1 })).rejects.toThrow(/QUOTA_EXCEEDED/);
    await reserve({ credits: 1, limit: current + 1 });
    await expect(reserve({ credits: 1, limit: current + 1 })).rejects.toThrow(/QUOTA_EXCEEDED/);
  });

  it("treats a null limit as set by contract", async () => {
    await expect(reserve({ limit: null })).resolves.toMatch(/[0-9a-f-]{36}/);
  });

  it("rejects a repeated idempotency key", async () => {
    await reserve({ key: "same-request" });
    await expect(reserve({ key: "same-request" })).rejects.toThrow(/DUPLICATE_REQUEST/);
  });

  it("rejects a period that doesn't contain the current time", async () => {
    const past = new Date(Date.now() - 2 * DAY).toISOString();
    await expect(reserve({ from: past, to: start() })).rejects.toThrow(/PERIOD_MISMATCH/);
  });

  it("refuses non-members and tasks from another organization", async () => {
    await expect(reserve({ actor: USERS.bob })).rejects.toThrow(/FORBIDDEN/);
    await expect(reserve({ org: bobOrg, actor: USERS.bob, task })).rejects.toThrow(/NOT_FOUND/);
  });

  it("rejects zero or negative credits", async () => {
    await expect(reserve({ credits: 0 })).rejects.toThrow(/INVALID_CREDITS/);
  });
});

describe("settling AI credits", () => {
  it("keeps settled credits and records provider usage and an audit event", async () => {
    const before = await used();
    const entry = await reserve();
    await settle(entry, "settled");
    expect(await used()).toBe(before + 1);
    const row = await asUser(USERS.alice, () =>
      db.query<{ status: string; model: string; input_tokens: number; output_tokens: number }>(
        "select status, model, input_tokens, output_tokens from public.ai_credit_ledger where id = $1",
        [entry],
      ),
    );
    expect(row.rows[0]).toEqual({ status: "settled", model: "claude-opus-5-5", input_tokens: 1200, output_tokens: 800 });
    const audit = await asService(() => db.query<{ action: string }>("select action from public.audit_events where target = $1", [entry]));
    expect(audit.rows.map((r) => r.action)).toEqual(["ai.credits_settled"]);
  });

  it("returns refunded credits to the allowance", async () => {
    const before = await used();
    const entry = await reserve();
    expect(await used()).toBe(before + 1);
    await settle(entry, "refunded");
    expect(await used()).toBe(before);
  });

  it("closes a reservation only once, and only in its own organization", async () => {
    const entry = await reserve();
    await expect(settle(entry, "refunded", bobOrg)).rejects.toThrow(/NOT_FOUND/);
    await settle(entry, "settled");
    await expect(settle(entry, "refunded")).rejects.toThrow(/NOT_FOUND/);
  });

  it("rejects an unknown status", async () => {
    const entry = await reserve();
    await expect(settle(entry, "reserved")).rejects.toThrow(/INVALID_STATUS/);
  });
});

describe("access", () => {
  it("only the server can reserve or settle", async () => {
    await expect(
      asUser(USERS.alice, () =>
        db.query("select public.app_reserve_ai_credits($1, $2, 'k', 'contract_draft', null, 1, 100, now() - interval '1 day', now() + interval '1 day')", [org, USERS.alice]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("select public.app_settle_ai_credits($1, gen_random_uuid(), 'refunded', null, null, null)", [org]))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("hides usage from other organizations and blocks browser writes", async () => {
    expect(await used(USERS.bob, org)).toBe(0);
    const rows = await asUser(USERS.bob, () => db.query("select id from public.ai_credit_ledger where org_id = $1", [org]));
    expect(rows.rows).toHaveLength(0);
    await expect(
      asUser(USERS.alice, () => db.query("insert into public.ai_credit_ledger (org_id, idempotency_key, operation, credits) values ($1, 'x', 'contract_draft', 1)", [org])),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("update public.ai_credit_ledger set status = 'refunded' where org_id = $1", [org]))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("can't be read anonymously", async () => {
    await expect(as(db, "anon", null, () => db.query("select public.ai_credits_used($1, now(), now())", [org]))).rejects.toThrow(/permission denied/);
  });
});
