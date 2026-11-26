/**
 * A call to a task's link (stage 277, ADR 0284), with the database standing in: the secret is taken only from the Authorization
 * header and never echoed or logged, a caller is limited before anything is compared, and a wrong secret, a stopped link and no
 * link are answered alike. SYNTHETIC values.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { LINK_DAILY_SECONDS, LINK_MIN_SECONDS, LINK_PAYLOAD_MAX, LINK_SECRET_PATTERN, type LinkFired } from "@/core/automation/links";
import { createCallLimiter, handleLinkCall, type LinkCallDeps } from "./link-call";
import { createLink, fireLink, hashLinkSecret, listLinks, newLinkSecret, revokeLink } from "./links";

vi.mock("server-only", () => ({}));

const LINK = "11111111-1111-4111-8111-111111111111";
const TASK = "22222222-2222-4222-8222-222222222222";
const SECRET = `fbl_${"A".repeat(43)}`;
const WHO = { orgId: "33333333-3333-4333-8333-333333333333", userId: "44444444-4444-4444-8444-444444444444" };

function setup(o: { fired?: LinkFired | "error" | "throws"; allowed?: boolean | "throws" } = {}) {
  const fires: { linkId: string; secret: string; body: string | null }[] = [];
  const logged: { event: string; fields: Record<string, unknown> }[] = [];
  const callers: string[] = [];
  const deps: LinkCallDeps = {
    caller: () => "caller-hash",
    allow: async (caller) => {
      callers.push(caller);
      if (o.allowed === "throws") throw new Error("down");
      return o.allowed ?? true;
    },
    fire: async (linkId, secret, body) => {
      fires.push({ linkId, secret, body });
      if (o.fired === "throws") throw new Error("down");
      return o.fired ?? "queued";
    },
    log: (event, fields) => void logged.push({ event, fields }),
  };
  return { deps, fires, logged, callers };
}
const call = (headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }, body: string | null = "order 1042 was paid") =>
  new Request(`https://www.farbaek.example/api/v1/hooks/${LINK}?secret=${SECRET}`, { method: "POST", headers, ...(body === null ? {} : { body }) });
const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as { data?: { status: string; message: string }; error?: { code: string; message: string } }, retry: r.headers.get("retry-after") });

describe("a call to a task's link", () => {
  it("queues a run with what was sent, and says so", async () => {
    const s = setup();
    const r = await read(await handleLinkCall(call(), LINK, s.deps));
    expect(r).toMatchObject({ status: 202, body: { data: { status: "queued", message: "The run will start within a few minutes." } } });
    expect(s.fires).toEqual([{ linkId: LINK, secret: SECRET, body: "order 1042 was paid" }]);
  });

  it("takes a call with no body", async () => {
    const s = setup();
    expect((await handleLinkCall(call({ authorization: `Bearer ${SECRET}` }, null), LINK, s.deps)).status).toBe(202);
    expect(s.fires[0]!.body).toBe("");
  });

  it("takes the secret only from the Authorization header: never from the address, another header or the body", async () => {
    for (const headers of [{}, { authorization: SECRET }, { authorization: `Basic ${SECRET}` }, { authorization: "Bearer " }, { authorization: `Bearer ${SECRET} extra` }, { "x-secret": SECRET }] as Record<string, string>[]) {
      const s = setup();
      const r = await read(await handleLinkCall(call(headers, SECRET), LINK, s.deps));
      expect(r, JSON.stringify(headers)).toMatchObject({ status: 401, body: { error: { code: "UNKNOWN_LINK", message: "That link or its secret isn't right." } } });
      expect(s.fires).toEqual([]);
    }
  });

  it("reads the word Bearer in any case, as the standard says, and nothing else in its place", async () => {
    for (const word of ["bearer", "BEARER", "BeArEr"]) {
      const s = setup();
      expect((await handleLinkCall(call({ authorization: `${word} ${SECRET}` }), LINK, s.deps)).status, word).toBe(202);
      expect(s.fires[0]!.secret).toBe(SECRET);
    }
  });

  it("answers a wrong secret, a stopped link and no link alike", async () => {
    const wrong = await read(await handleLinkCall(call(), LINK, setup({ fired: "unknown" }).deps));
    const missing = await read(await handleLinkCall(call({}), LINK, setup().deps));
    expect(wrong).toEqual(missing);
    expect(wrong.status).toBe(401);
  });

  it("says when to try again, and why a run can't start", async () => {
    expect(await read(await handleLinkCall(call(), LINK, setup({ fired: "too_soon" }).deps))).toMatchObject({ status: 429, body: { error: { code: "TOO_SOON" } }, retry: String(LINK_MIN_SECONDS) });
    expect(await read(await handleLinkCall(call(), LINK, setup({ fired: "busy" }).deps))).toMatchObject({ status: 409, body: { error: { code: "BUSY" } } });
    expect(await read(await handleLinkCall(call(), LINK, setup({ fired: "off" }).deps))).toMatchObject({ status: 409, body: { error: { code: "OFF" } } });
  });

  it("limits a caller before anything is compared, and refuses when the limit can't be checked", async () => {
    for (const allowed of [false, "throws"] as const) {
      const s = setup({ allowed });
      expect(await read(await handleLinkCall(call(), LINK, s.deps))).toMatchObject({ status: 429, body: { error: { code: "RATE_LIMITED" } }, retry: "60" });
      expect(s.fires).toEqual([]);
      expect(s.callers).toEqual(["caller-hash"]);
    }
  });

  it("refuses a body that is too large, without asking about the link", async () => {
    const s = setup();
    expect(await read(await handleLinkCall(call({ authorization: `Bearer ${SECRET}` }, "x".repeat(9000)), LINK, s.deps))).toMatchObject({ status: 413, body: { error: { code: "TOO_LARGE" } } });
    expect(s.fires).toEqual([]);
  });

  it("refuses text longer than a run may be given, never cutting it in silence; the longest allowed is taken whole", async () => {
    const most = setup();
    expect((await handleLinkCall(call({ authorization: `Bearer ${SECRET}` }, "x".repeat(LINK_PAYLOAD_MAX)), LINK, most.deps)).status).toBe(202);
    expect(most.fires[0]!.body).toHaveLength(LINK_PAYLOAD_MAX);
    // Space around it isn't counted: it is trimmed before it is kept.
    const padded = setup();
    expect((await handleLinkCall(call({ authorization: `Bearer ${SECRET}` }, `  ${"x".repeat(LINK_PAYLOAD_MAX)}\n`), LINK, padded.deps)).status).toBe(202);
    const over = setup();
    const r = await read(await handleLinkCall(call({ authorization: `Bearer ${SECRET}` }, "x".repeat(LINK_PAYLOAD_MAX + 1)), LINK, over.deps));
    expect(r).toMatchObject({ status: 413, body: { error: { code: "TOO_LARGE", message: "The body is too large. Send at most 2,000 characters of text." } } });
    expect(over.fires).toEqual([]);
  });

  it("asks the caller to try again when the call couldn't be taken, and never says the link is wrong for that", async () => {
    for (const fired of ["error", "throws"] as const) {
      expect(await read(await handleLinkCall(call(), LINK, setup({ fired }).deps))).toMatchObject({ status: 503, body: { error: { code: "UNAVAILABLE" } }, retry: "30" });
    }
  });

  it("never sends back or logs the secret or what was sent", async () => {
    for (const fired of ["queued", "unknown", "too_soon", "busy", "off", "error"] as const) {
      const s = setup({ fired });
      const response = await handleLinkCall(call(), LINK, s.deps);
      const said = `${await response.text()} ${JSON.stringify([...response.headers])} ${JSON.stringify(s.logged)}`;
      expect(said).not.toContain(SECRET);
      expect(said).not.toContain("order 1042");
    }
    const s = setup();
    await handleLinkCall(call(), LINK, s.deps);
    expect(s.logged).toEqual([{ event: "link.called", fields: { link: LINK, outcome: "queued" } }]);
    // An id that isn't one is logged as that, not as whatever was sent in its place.
    const odd = setup({ fired: "unknown" });
    await handleLinkCall(call(), "<script>", odd.deps);
    expect(odd.logged[0]!.fields).toEqual({ link: "malformed", outcome: "unknown" });
  });
});

describe("the count of calls by caller", () => {
  it("lets a caller make so many calls in a minute, then refuses until the minute has passed", () => {
    let at = 1_000;
    const allow = createCallLimiter(3, 60_000, 100, () => at);
    expect([allow("a"), allow("a"), allow("a"), allow("a"), allow("a")]).toEqual([true, true, true, false, false]);
    // Another caller is counted on its own.
    expect(allow("b")).toBe(true);
    at += 59_999;
    expect(allow("a")).toBe(false);
    at += 1;
    expect([allow("a"), allow("a"), allow("a"), allow("a")]).toEqual([true, true, true, false]);
  });

  it("never holds more callers than its room, whatever a flood of made-up addresses sends", () => {
    let at = 0;
    const allow = createCallLimiter(2, 60_000, 50, () => at);
    let most = 0;
    for (let i = 0; i < 5_000; i++) {
      at += 1;
      expect(allow(`caller-${i}`)).toBe(true);
      most = Math.max(most, allow.size());
    }
    // Counted, not assumed: at no point did it hold more than its room.
    expect(most).toBe(50);
    expect(allow.size()).toBeLessThanOrEqual(50);
    // The room held, and a real caller arriving in the middle of it is still counted.
    expect([allow("real"), allow("real"), allow("real")]).toEqual([true, true, false]);
    // Once their minute has passed, the old ones go and make room without dropping anyone still being counted.
    at += 60_000;
    expect(allow("late")).toBe(true);
    expect([allow("late"), allow("late")]).toEqual([true, false]);
    expect(allow.size()).toBeLessThanOrEqual(50);
  });
});

describe("links, as the server makes and checks them", () => {
  const admin = (answer: { data?: unknown; error?: { code?: string; message?: string } | null }) => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const api = { rpc: async (name: string, args: Record<string, unknown>) => (calls.push({ name, args }), { data: null, error: null, ...answer }) };
    return { api: api as unknown as SupabaseClient, calls };
  };

  it("makes a secret of the right shape, different every time, and gives the database only its hash", async () => {
    const a = newLinkSecret();
    expect(LINK_SECRET_PATTERN.test(a)).toBe(true);
    expect(newLinkSecret()).not.toBe(a);
    const db = admin({ data: LINK });
    const made = await createLink(db.api, WHO, TASK, LINK_DAILY_SECONDS);
    expect(made).toMatchObject({ ok: true, value: { id: LINK } });
    const secret = made.ok ? made.value.secret : "";
    expect(LINK_SECRET_PATTERN.test(secret)).toBe(true);
    expect(db.calls[0]!.args).toEqual({ p_org: WHO.orgId, p_actor: WHO.userId, p_task: TASK, p_secret_hash: createHash("sha256").update(secret).digest("hex"), p_min_seconds: LINK_DAILY_SECONDS });
    expect(JSON.stringify(db.calls)).not.toContain(secret);
    expect(hashLinkSecret(secret)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("says why a link couldn't be made or stopped", async () => {
    expect(await createLink(admin({ error: { message: "NOT_FOUND", code: "P0001" } }).api, WHO, TASK, LINK_MIN_SECONDS)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await createLink(admin({ error: { code: "42501", message: "permission denied" } }).api, WHO, TASK, LINK_MIN_SECONDS)).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(await createLink(admin({ data: "not an id" }).api, WHO, TASK, LINK_MIN_SECONDS)).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(await revokeLink(admin({ data: true }).api, WHO, TASK)).toEqual({ ok: true, value: true });
    expect(await revokeLink(admin({ data: false }).api, WHO, TASK)).toEqual({ ok: true, value: false });
    expect(await revokeLink(admin({ error: { message: "NOT_FOUND" } }).api, WHO, TASK)).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("refuses a secret or an id that isn't shaped as Farbaek makes them, without asking the database", async () => {
    for (const [id, secret] of [
      [LINK, "wrong"],
      [LINK, `fbl_${"A".repeat(42)}`],
      ["not-an-id", SECRET],
      ["", SECRET],
    ]) {
      const db = admin({ data: "queued" });
      expect(await fireLink(db.api, id!, secret!, "x")).toBe("unknown");
      expect(db.calls).toEqual([]);
    }
  });

  it("sends the hash and the cleaned text, and passes on the database's answer", async () => {
    const db = admin({ data: "queued" });
    expect(await fireLink(db.api, LINK, SECRET, "  paid\u0000 \n")).toBe("queued");
    expect(db.calls[0]!.args).toEqual({ p_link: LINK, p_secret_hash: hashLinkSecret(SECRET), p_payload: "paid", p_min_seconds: LINK_MIN_SECONDS });
    expect(await fireLink(admin({ data: "busy" }).api, LINK, SECRET, null)).toBe("busy");
    expect(await fireLink(admin({ data: "something else" }).api, LINK, SECRET, null)).toBe("error");
    expect(await fireLink(admin({ error: { code: "57014" } }).api, LINK, SECRET, null)).toBe("error");
  });

  it("lists a person's live links by task, says they couldn't be read, and offers none on a database without them", async () => {
    const reader = (answer: { data?: unknown; error?: { code?: string } | null }) => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "limit"]) chain[method] = () => chain;
      chain.then = (resolve: (a: unknown) => unknown) => Promise.resolve({ data: null, error: null, ...answer }).then(resolve);
      return { from: () => chain } as unknown as SupabaseClient;
    };
    const row = { id: LINK, task_id: TASK, created_at: "2026-11-25T00:00:00Z", last_used_at: null, uses: 3, min_seconds: LINK_DAILY_SECONDS };
    const links = await listLinks(reader({ data: [row] }), WHO.orgId);
    expect(links instanceof Map && links.get(TASK)).toEqual({ id: LINK, taskId: TASK, createdAt: "2026-11-25T00:00:00Z", lastUsedAt: null, uses: 3, waitSeconds: LINK_DAILY_SECONDS });
    // A wait shorter than any link may have is shown as the shortest there is, which is what the server holds it to.
    const short = await listLinks(reader({ data: [{ ...row, min_seconds: 60 }] }), WHO.orgId);
    expect(short instanceof Map && short.get(TASK)?.waitSeconds).toBe(LINK_MIN_SECONDS);
    expect(await listLinks(reader({ error: { code: "PGRST205" } }), WHO.orgId)).toBe("off");
    expect(await listLinks(reader({ error: { code: "42P01" } }), WHO.orgId)).toBe("off");
    expect(await listLinks(reader({ error: { code: "57014" } }), WHO.orgId)).toBeNull();
    expect(await listLinks(reader({ data: [{ id: "x" }] }), WHO.orgId)).toBeNull();
  });
});
