import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb } from "./harness";

/**
 * Migration v57 (ADR 0090): the Model Change Canary. Staff start a canary
 * (one at a time, three a day); only an owner with a fresh authenticator
 * code switches a tier, and only to a candidate a finished canary compared
 * in the last 7 days. Each staff call records one chained event; a refused
 * one records none. Browsers can't reach any of it.
 */

const OWNER = "00000000-0000-4000-8000-0000000000c0";
const ADMIN = "00000000-0000-4000-8000-0000000000c1";
const VIEWER = "00000000-0000-4000-8000-0000000000c2";
const REASON = "Anthropic listed a newer Sonnet; compare before switching";
let db: PGlite;
const sessions: Record<string, string> = {};

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const events = async () => Number((await su<{ n: number }>("select count(*)::int as n from public.staff_audit_events"))[0]!.n);
const lastEvent = async () => (await su<{ action: string; auth_strength: string }>("select action, auth_strength from public.staff_audit_events order by seq desc limit 1"))[0]!;

const start = (actor: string, candidate = "claude-sonnet-5-6", reason = REASON) =>
  q<{ id: string }>("select public.app_staff_start_canary($1, $2, 'anthropic', 'standard', 'claude-sonnet-5-5', $3, 1200, $4, null, null) as id", [actor, sessions[actor], candidate, reason]).then((r) => r[0]!.id);
const finish = (id: string, status = "finished") =>
  q("select public.app_finish_canary($1, $2, $3, $4, $5)", [id, status, status === "finished" ? JSON.stringify({ tasks: [] }) : null, status === "finished" ? "a".repeat(64) : null, status === "failed" ? "The candidate refused every task." : null]);
const setModel = (actor: string, model: string | null, canary: string | null, strength = "step_up") =>
  q("select public.app_staff_set_model($1, $2, 'anthropic', 'standard', $3, $4, $5, $6, null, null)", [actor, sessions[actor], model, canary, REASON, strength]);

beforeAll(async () => {
  db = await createTestDb();
  for (const [id, email, role] of [
    [OWNER, "info@farbaek.com", "owner"],
    [ADMIN, "admin@farbaek.com", "admin"],
    [VIEWER, "viewer@farbaek.com", "viewer"],
  ] as const) {
    await su("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [id, email]);
    await su("insert into public.staff_members (user_id, email, role) values ($1, $2, $3)", [id, email, role]);
    sessions[id] = crypto.randomUUID();
    await su("insert into public.staff_sessions (session_id, user_id, first_factor_at) values ($1, $2, now())", [sessions[id], id]);
  }
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("who can reach it", () => {
  it("keeps browsers out of the functions and the tables", async () => {
    await expect(as(db, "authenticated", OWNER, () => db.query("select public.app_staff_start_canary($1, $2, 'anthropic', 'standard', 'a-model', 'b-model', 1, $3, null, null)", [OWNER, sessions[OWNER], REASON]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query("select public.app_record_model_check('[]', '[]')"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", OWNER, () => db.query("select * from public.platform_models"))).rejects.toThrow(/permission denied/);
    // The server key reads, but writes only through the functions.
    await expect(q("insert into public.model_checks (listed, findings) values ('[]', '[]')")).rejects.toThrow(/permission denied/);
  });
});

describe("a canary", () => {
  it("is for owners and admins, with a reason, one at a time and three a day, recording one event each", async () => {
    const before = await events();
    await expect(start(VIEWER)).rejects.toThrow(/STAFF_FORBIDDEN/);
    await expect(start(ADMIN, "claude-sonnet-5-6", "short")).rejects.toThrow(/REASON_REQUIRED/);
    expect(await events()).toBe(before);

    const first = await start(ADMIN);
    expect(await lastEvent()).toEqual({ action: "models.canary_started", auth_strength: "aal2" });
    await expect(start(OWNER)).rejects.toThrow(/CANARY_RUNNING/);
    await finish(first, "failed");
    await expect(finish(first)).rejects.toThrow(/NOT_FOUND/);
    await finish(await start(OWNER));
    await finish(await start(OWNER));
    await expect(start(OWNER)).rejects.toThrow(/CANARY_LIMIT/);
    expect(await events()).toBe(before + 3);
    // A failed run keeps its reason and no report.
    expect((await su<{ status: string; failure: string; report: unknown }>("select status, failure, report from public.model_canary_runs where id = $1", [first]))[0]).toEqual({ status: "failed", failure: "The candidate refused every task.", report: null });
  });
});

describe("switching a tier", () => {
  it("needs an owner, a fresh authenticator code and a recent finished canary for that exact candidate", async () => {
    const done = (await su<{ id: string }>("select id from public.model_canary_runs where status = 'finished' order by started_at desc limit 1"))[0]!.id;
    const failed = (await su<{ id: string }>("select id from public.model_canary_runs where status = 'failed' limit 1"))[0]!.id;
    const before = await events();
    await expect(setModel(ADMIN, "claude-sonnet-5-6", done)).rejects.toThrow(/STAFF_FORBIDDEN/);
    await expect(setModel(OWNER, "claude-sonnet-5-6", done, "aal2")).rejects.toThrow(/STEP_UP_REQUIRED/);
    await expect(setModel(OWNER, "claude-sonnet-5-6", failed)).rejects.toThrow(/CANARY_REQUIRED/);
    await expect(setModel(OWNER, "claude-opus-5-5", done)).rejects.toThrow(/CANARY_REQUIRED/);
    expect(await events()).toBe(before);

    await setModel(OWNER, "claude-sonnet-5-6", done);
    expect(await lastEvent()).toEqual({ action: "models.switched", auth_strength: "step_up" });
    expect(await su("select tier, model, canary_id from public.platform_models")).toEqual([{ tier: "standard", model: "claude-sonnet-5-6", canary_id: done }]);

    // An old report no longer counts.
    await su("update public.model_canary_runs set finished_at = now() - interval '8 days' where id = $1", [done]);
    await expect(setModel(OWNER, "claude-sonnet-5-6", done)).rejects.toThrow(/CANARY_REQUIRED/);
  });

  it("returns a tier to its default, and says when there's nothing to return", async () => {
    await setModel(OWNER, null, null);
    expect(await lastEvent()).toEqual({ action: "models.default_restored", auth_strength: "step_up" });
    expect(await su("select * from public.platform_models")).toEqual([]);
    await expect(setModel(OWNER, null, null)).rejects.toThrow(/NOTHING_TO_CHANGE/);
  });
});

describe("the daily check", () => {
  it("records what was listed and found, and alerts can be claimed for model findings", async () => {
    await q("select public.app_record_model_check($1, $2)", [JSON.stringify([{ id: "claude-sonnet-5-5" }]), JSON.stringify([{ kind: "newer", model: "claude-sonnet-5-6" }])]);
    expect((await su<{ n: number }>("select count(*)::int as n from public.model_checks"))[0]!.n).toBe(1);
    expect((await q<{ ok: boolean }>("select public.app_claim_platform_alert(current_date, 'model_newer') as ok"))[0]!.ok).toBe(true);
    expect((await q<{ ok: boolean }>("select public.app_claim_platform_alert(current_date, 'model_newer') as ok"))[0]!.ok).toBe(false);
  });
});
