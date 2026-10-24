/**
 * Migration v40 (ADR 0068): today's AI usage across the platform, counted as
 * the daily limit counts it, and alerts claimed once per day.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const grant = JSON.stringify({ kind: "plan", units: 1_000_000, starts_at: iso(-86_400_000), expires_at: iso(30 * 86_400_000), source_key: "plan:current" });
let seq = 0;
const reserve = (units: number) => q("select public.app_reserve_usage($1, $2, $3, 'agent_step', null, $4, $5) as id", [org, USERS.alice, `alert-${++seq}`, units, grant]);
const today = async () => Number((await q<{ n: string }>("select public.app_platform_ai_units_today() as n"))[0]!.n);
const claim = async (day: string, kind: string) => (await q<{ ok: boolean }>("select public.app_claim_platform_alert($1, $2) as ok", [day, kind]))[0]!.ok;
const status = async (day: string, kind: string) => (await db.query<{ status: string; attempts: number }>("select status, attempts from public.platform_alerts where day = $1 and kind = $2", [day, kind])).rows[0];

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alerts");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("today's AI usage", () => {
  it("counts reserved and settled units since midnight UTC, and nothing else", async () => {
    const before = await today();
    await reserve(300);
    await reserve(400);
    expect(await today()).toBe(before + 700);
    await db.exec(`
      update public.ai_credit_ledger set status = 'refunded', settled_at = now() where idempotency_key = 'alert-2';
      update public.ai_credit_ledger set created_at = now() - interval '2 days' where idempotency_key = 'alert-1';
    `);
    expect(await today()).toBe(before);
  });
});

describe("alert claims", () => {
  it("claims an alert once a day, and lets a failed one be tried three times in all", async () => {
    expect(await claim("2026-10-24", "ai_spend_80")).toBe(true);
    expect(await claim("2026-10-24", "ai_spend_80")).toBe(false);
    expect(await claim("2026-10-25", "ai_spend_80")).toBe(true);

    await q("select public.app_finish_platform_alert('2026-10-24', 'ai_spend_80', 'failed', 'refused')");
    expect(await claim("2026-10-24", "ai_spend_80")).toBe(true);
    await q("select public.app_finish_platform_alert('2026-10-24', 'ai_spend_80', 'failed', 'refused')");
    expect(await claim("2026-10-24", "ai_spend_80")).toBe(true);
    await q("select public.app_finish_platform_alert('2026-10-24', 'ai_spend_80', 'failed', 'refused')");
    expect(await claim("2026-10-24", "ai_spend_80")).toBe(false);
    expect(await status("2026-10-24", "ai_spend_80")).toEqual({ status: "failed", attempts: 3 });
  });

  it("finishes only a claimed alert, and skips without overwriting", async () => {
    await q("select public.app_skip_platform_alert('2026-10-26', 'ai_spend_80', 'already at the limit')");
    await q("select public.app_finish_platform_alert('2026-10-26', 'ai_spend_80', 'accepted', null)");
    expect((await status("2026-10-26", "ai_spend_80"))?.status).toBe("skipped");
    expect(await claim("2026-10-26", "ai_spend_80")).toBe(false);

    expect(await claim("2026-10-26", "ai_spend_100")).toBe(true);
    await q("select public.app_finish_platform_alert('2026-10-26', 'ai_spend_100', 'accepted', null)");
    await q("select public.app_skip_platform_alert('2026-10-26', 'ai_spend_100', 'late')");
    expect((await status("2026-10-26", "ai_spend_100"))?.status).toBe("accepted");
    await expect(q("select public.app_finish_platform_alert('2026-10-26', 'ai_spend_100', 'sending', null)")).rejects.toThrow(/INVALID_STATUS/);
    expect(await q("select kind, status from public.app_platform_alerts_on('2026-10-26') order by kind")).toEqual([
      { kind: "ai_spend_100", status: "accepted" },
      { kind: "ai_spend_80", status: "skipped" },
    ]);
  });

  it("stays out of reach of browsers", async () => {
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_platform_ai_units_today()"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_claim_platform_alert('2026-10-27', 'ai_spend_80')"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query("select * from public.platform_alerts"))).rejects.toThrow(/permission denied/);
  });
});
