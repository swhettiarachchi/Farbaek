/**
 * Migration v87 (ADR 0154): plans bought through Google Play. Google is a
 * third provider for the same apply function; a token binds to a workspace
 * only through an intent or as its current token's successor, never moves
 * once bound, and only the server can reach any of it. Purchases here are
 * mock data.
 */
import type { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let other: string;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const PRODUCT = "farbaek_starter_monthly";

const intent = (o: string, actor: string, product = PRODUCT) => q<{ id: string }>("select public.app_google_open_intent($1, $2, $3) as id", [o, actor, product]).then((r) => r[0]!.id);
const bind = (o: string, actor: string, token: string, opts: { product?: string; predecessor?: string | null; startedAt?: string } = {}) =>
  q<{ r: string }>("select public.app_google_bind_purchase($1, $2, $3, $4, $5, 'test', $6, $7) as r", [
    o,
    actor,
    token,
    sha(token),
    opts.product ?? PRODUCT,
    opts.predecessor ?? null,
    opts.startedAt ?? new Date().toISOString(),
  ]).then((r) => r[0]!.r);
const apply = (o: string, id: string, state: string) =>
  q<{ r: string }>(
    "select public.app_billing_apply_subscription($1, 'google', 'test', $2, null, $3, 'starter', now() + interval '30 days', null, false, now(), now(), 'google.claim') as r",
    [o, id, state],
  ).then((r) => r[0]!.r);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Mock Play Studio");
  other = await createOrg(db, USERS.bob, "Mock Other Studio");
  await su("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("plans bought through Google Play", () => {
  it("applies a Google subscription through the same function as Dodo's and Apple's", async () => {
    const id = `gp_${sha("token.applied.0001")}`;
    expect(await apply(other, id, "active")).toBe("applied");
    expect((await su<{ provider: string; state: string }>("select provider, state::text from public.billing_accounts where org_id = $1", [other]))[0]).toEqual({ provider: "google", state: "active" });
    await expect(q("select public.app_billing_apply_subscription($1, 'stripe', 'test', 'sub_x', null, 'active', 'starter', now(), null, false, now(), now(), 'x')", [org])).rejects.toThrow(
      /billing_accounts_provider_check/,
    );
  });

  it("binds a first purchase only through an intent opened before it, by an owner or admin", async () => {
    expect(await bind(org, USERS.alice, "token.first.purchase.0001")).toBe("no_intent");
    await expect(intent(org, USERS.bob)).rejects.toThrow();
    await intent(org, USERS.alice);
    // A purchase that began well before the intent doesn't match it.
    expect(await bind(org, USERS.alice, "token.first.purchase.0001", { startedAt: new Date(Date.now() - 3_600_000).toISOString() })).toBe("no_intent");
    expect(await bind(org, USERS.alice, "token.first.purchase.0001")).toBe("bound");
    expect(await bind(org, USERS.alice, "token.first.purchase.0001")).toBe("bound_here");
    // The intent is used up.
    expect(await bind(org, USERS.alice, "token.first.purchase.0002")).toBe("no_intent");
  });

  it("never moves a token, and refuses a plain purchase while a Google plan is live", async () => {
    await intent(other, USERS.bob);
    expect(await bind(other, USERS.bob, "token.first.purchase.0001")).toBe("bound_elsewhere");
    expect(await apply(org, `gp_${sha("token.first.purchase.0001")}`, "active")).toBe("applied");
    await intent(org, USERS.alice);
    expect(await bind(org, USERS.alice, "token.another.purchase.0003")).toBe("needs_successor");
  });

  it("lets a plan change replace the current token, and marks the old one superseded", async () => {
    const old = sha("token.first.purchase.0001");
    expect(await bind(org, USERS.alice, "token.changed.plan.0004", { predecessor: old })).toBe("successor");
    const rows = await su<{ token_sha256: string; status: string; predecessor_sha256: string | null }>(
      "select token_sha256, status, predecessor_sha256 from public.google_play_purchases where org_id = $1 order by bound_at",
      [org],
    );
    expect(rows.find((r) => r.token_sha256 === old)!.status).toBe("superseded");
    expect(rows.find((r) => r.token_sha256 === sha("token.changed.plan.0004"))!.predecessor_sha256).toBe(old);
    // Another workspace can't use this workspace's token as a predecessor.
    expect(await bind(other, USERS.bob, "token.stolen.chain.0005", { predecessor: old })).toBe("bound_elsewhere");
  });

  it("refuses a workspace billed on the web or through Apple", async () => {
    const apple = await createOrg(db, USERS.alice, "Mock Apple Billed");
    await q("select public.app_billing_apply_subscription($1, 'apple', 'test', '2000000999000077', null, 'active', 'starter', now() + interval '30 days', null, false, now(), now(), 'apple.transaction')", [apple]);
    await intent(apple, USERS.alice);
    expect(await bind(apple, USERS.alice, "token.paid.elsewhere.0006")).toBe("paid_elsewhere");
  });

  it("checks the token's hash, and records checks and acknowledgements", async () => {
    await expect(q("select public.app_google_bind_purchase($1, $2, 'token.bad.hash.0007', $3, $4, 'test', null, now())", [org, USERS.alice, "0".repeat(64), PRODUCT])).rejects.toThrow(/TOKEN_HASH_MISMATCH/);
    const s = sha("token.changed.plan.0004");
    await q("select public.app_google_mark_checked($1, 'active', now(), now() + interval '1 day', 'ACTIVE')", [s]);
    await q("select public.app_google_mark_acknowledged($1)", [s]);
    expect((await su<{ acknowledged: boolean; detail: string }>("select acknowledged, detail from public.google_play_purchases where token_sha256 = $1", [s]))[0]).toEqual({ acknowledged: true, detail: "ACTIVE" });
    await expect(q("select public.app_google_mark_checked($1, 'lost', now(), now(), null)", [s])).rejects.toThrow(/INVALID_STATUS/);
    await q("select public.app_google_set_voided_since(now())");
    expect((await su<{ n: number }>("select count(*)::int as n from public.google_play_sync where voided_since is not null"))[0]!.n).toBe(1);
  });

  it("keeps intents, purchases and their functions to the server", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      for (const table of ["google_play_intents", "google_play_purchases", "google_play_sync"]) {
        await expect(as(db, role, USERS.alice, () => db.query(`select * from public.${table}`))).rejects.toThrow(/permission denied/);
      }
      await expect(as(db, role, USERS.alice, () => db.query("select public.app_google_open_intent($1, $2, $3)", [org, USERS.alice, PRODUCT]))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, USERS.alice, () => db.query("select public.app_google_mark_acknowledged($1)", [sha("x")]))).rejects.toThrow(/permission denied/);
    }
    await expect(q("insert into public.google_play_intents (org_id, product_id) values ($1, $2)", [org, PRODUCT])).rejects.toThrow(/permission denied/);
  });
});
