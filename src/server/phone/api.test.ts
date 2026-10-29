import { describe, expect, it } from "vitest";
import { DEMO_PROPOSAL_TASK_ID, DEMO_USER } from "@/content/demo-workspace";
import { createDemoReader } from "@/server/workspace/demo-reader";
import type { AppContext } from "@/server/workspace/context";
import { handlePhoneApi, type PhoneApiDeps, type PhoneWrites } from "./api";
import type { PhoneAuthDeps } from "./auth";
import { challengeFor } from "./tokens";
import { NO_RUNS, fileDiff } from "./views";

const SITE = "https://www.farbaek.com";
const JWT = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const NOW = new Date("2026-10-29T12:00:00Z");

async function demoContext(over: Partial<AppContext> = {}): Promise<AppContext> {
  const reader = createDemoReader(NOW);
  const workspaces = await reader.listWorkspaces();
  return { mode: "live", user: { ...DEMO_USER }, reader, workspaces, current: workspaces[0]!, role: "owner", permissions: {}, writes: { enabled: true }, ...over };
}

function deps(options: { expiresAt?: number; ctx?: Partial<AppContext>; revoked?: boolean } = {}) {
  const calls: string[] = [];
  const codes = new Map<string, string>();
  const auth: PhoneAuthDeps = {
    store: {
      createCode: async (i) => (codes.set(i.codeHash, i.challenge), "ok"),
      redeemCode: async (hash, challenge) => (codes.get(hash) === challenge ? (codes.delete(hash), { userId: DEMO_USER.id, platform: "ios", deviceName: "iPhone" }) : null),
      register: async () => "device-1",
      seen: async () => (options.revoked ? null : { deviceId: "device-1", userId: DEMO_USER.id, platform: "ios", push: false }),
      revoke: async () => "signed_out",
      setPush: async () => true,
      rateLimit: async () => true,
    },
    auth: {
      newSession: async () => ({ accessToken: JWT, refreshToken: "refresh-abc123", expiresAt: 2_000_000_000, sessionId: "s1" }),
      refresh: async () => null,
      verify: async (t) => (t === JWT ? { userId: DEMO_USER.id, email: DEMO_USER.email, sessionId: "s1", expiresAt: options.expiresAt ?? NOW.getTime() / 1000 + 3600 } : null),
    },
  };
  const writes: PhoneWrites = {
    approve: async (_p, i) => (calls.push(`approve:${i.sha256.slice(0, 6)}`), { ok: true, value: { written: 1, checking: true } }),
    discard: async () => ({ ok: true, value: null }),
    build: async () => ({ ok: true, value: { taskId: "t", projectId: "p", planned: true, planNote: null } }),
    approvePlan: async () => (calls.push("approvePlan"), { ok: true, value: { runId: "r", startNote: null } }),
    answerRun: () => ({ ok: true, value: null }),
    stopRun: () => ({ ok: true, value: null }),
    messageRun: () => ({ ok: true, value: null }),
    setPush: async () => true,
    signOut: async () => (calls.push("signOut"), "signed_out"),
  };
  const d: PhoneApiDeps = {
    auth,
    siteOrigin: SITE,
    browserUser: async () => DEMO_USER.id,
    live: async () => ({ ctx: await demoContext(options.ctx), runs: NO_RUNS }),
    sample: async () => ({ ctx: await demoContext({ mode: "demo", writes: { enabled: false, reason: "Sample." } }), runs: NO_RUNS }),
    execution: () => ({ mode: "sandboxed" }),
    writes,
    pushAvailable: () => false,
    clientKey: () => "client",
    now: () => NOW,
  };
  return { deps: d, calls };
}

const call = (d: PhoneApiDeps, method: string, path: string, init: { body?: unknown; token?: boolean; headers?: Record<string, string> } = {}) =>
  handlePhoneApi(
    new Request(`${SITE}/api/v1/app/${path}`, {
      method,
      headers: { ...(init.body !== undefined ? { "content-type": "application/json" } : {}), ...(init.token === false ? {} : { authorization: `Bearer ${JWT}` }), ...init.headers },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    }),
    path.split("?")[0]!.split("/"),
    d,
  );
const data = async (r: Response) => ((await r.json()) as { data: Record<string, unknown> }).data;

describe("the phone API (ADR 0110)", () => {
  it("answers the sample workspace's reads with no account, and refuses its writes", async () => {
    const { deps: d } = deps();
    const me = await call(d, "GET", "sample/me", { token: false });
    expect(me.status).toBe(200);
    expect(await data(me)).toMatchObject({ sample: true, writes: { enabled: false } });
    const approvals = await data(await call(d, "GET", "sample/approvals", { token: false }));
    expect((approvals.items as { taskId: string }[]).map((i) => i.taskId)).toContain(DEMO_PROPOSAL_TASK_ID);
    const write = await call(d, "POST", `sample/approvals/${DEMO_PROPOSAL_TASK_ID}/approve`, { token: false, body: { proposalId: crypto.randomUUID(), sha256: "a".repeat(64) } });
    expect(write.status).toBe(403);
    expect(((await write.json()) as { error: { code: string } }).error.code).toBe("SAMPLE_READ_ONLY");
  });

  it("shows one approval in full, as numbered diff lines", async () => {
    const { deps: d } = deps();
    const view = await data(await call(d, "GET", `sample/approvals/${DEMO_PROPOSAL_TASK_ID}`, { token: false }));
    const proposal = view.proposal as { sha256: string; files: { path: string; hunks: { lines: { kind: string }[] }[] }[] };
    expect(proposal.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(proposal.files.length).toBeGreaterThan(0);
    expect(proposal.files.flatMap((f) => f.hunks.flatMap((h) => h.lines.map((l) => l.kind)))).toContain("add");
    // The sample is read-only, so it says why approving isn't possible.
    expect(view).toMatchObject({ canApprove: false, approveReason: "Sample." });
  });

  it("needs a connected phone's token for everything else", async () => {
    expect((await call(deps().deps, "GET", "me", { token: false })).status).toBe(401);
    const revoked = await call(deps({ revoked: true }).deps, "GET", "me");
    expect(revoked.status).toBe(401);
    expect(((await revoked.json()) as { error: { code: string } }).error.code).toBe("DISCONNECTED");
    expect((await call(deps().deps, "GET", "me")).status).toBe(200);
    expect((await call(deps().deps, "GET", "nowhere")).status).toBe(404);
    expect((await call(deps().deps, "DELETE", "me")).status).toBe(405);
  });

  it("refuses a workspace the person isn't in", async () => {
    const r = await call(deps().deps, "GET", "home", { headers: { "x-farbaek-workspace": crypto.randomUUID() } });
    expect(r.status).toBe(404);
  });

  it("checks writes the way the web does, before any use case runs", async () => {
    const { deps: d, calls } = deps({ ctx: { writes: { enabled: false, reason: "You have view-only access to this workspace." } } });
    const r = await call(d, "POST", `approvals/${DEMO_PROPOSAL_TASK_ID}/approve`, { body: { proposalId: crypto.randomUUID(), sha256: "a".repeat(64) } });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: { code: "READ_ONLY", message: "You have view-only access to this workspace." } });
    expect(calls).toEqual([]);
    expect((await call(deps().deps, "POST", `approvals/${DEMO_PROPOSAL_TASK_ID}/approve`, { body: { proposalId: "not-a-uuid", sha256: "x" } })).status).toBe(400);
  });

  it("asks for a fresh token before starting an agent, so the run's sandbox outlasts it", async () => {
    const short = deps({ expiresAt: NOW.getTime() / 1000 + 600 });
    const body = { version: 1, sha256: "b".repeat(64), expectedTaskVersion: 3, effort: "balanced" };
    const r = await call(short.deps, "POST", `tasks/${DEMO_PROPOSAL_TASK_ID}/plan/approve`, { body });
    expect(r.status).toBe(409);
    expect(short.calls).toEqual([]);
    const long = deps();
    expect((await call(long.deps, "POST", `tasks/${DEMO_PROPOSAL_TASK_ID}/plan/approve`, { body })).status).toBe(200);
    expect(long.calls).toEqual(["approvePlan"]);
  });

  it("connects a phone end to end: browser form, done page, code exchange", async () => {
    const { deps: d } = deps();
    const challenge = challengeFor(VERIFIER);
    const form = new URLSearchParams({ challenge, state: "state-1234", platform: "ios", device: "iPhone" });
    const post = (origin: string) =>
      handlePhoneApi(new Request(`${SITE}/api/v1/app/connect`, { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: form.toString() }), ["connect"], d);
    expect((await post("https://evil.example")).status).toBe(403);
    const answer = await post(SITE);
    expect(answer.status).toBe(303);
    const location = new URL(answer.headers.get("location")!, SITE);
    expect(location.pathname).toBe("/auth/connect/done");
    const code = location.searchParams.get("code")!;
    const token = await call(d, "POST", "token", { token: false, body: { code, verifier: VERIFIER, appVersion: "1.0" } });
    expect(token.status).toBe(200);
    expect(await data(token)).toMatchObject({ accessToken: JWT, deviceId: "device-1" });
    expect((await call(d, "POST", "token", { token: false, body: { code, verifier: VERIFIER } })).status).toBe(400);
  });

  it("signs out by disconnecting the phone itself", async () => {
    const { deps: d, calls } = deps();
    expect(await data(await call(d, "DELETE", "session"))).toEqual({ signedOut: true });
    expect(calls).toEqual(["signOut"]);
  });

  it("says plainly when notifications for iPhone aren't set up", async () => {
    const r = await call(deps().deps, "PUT", "push", { body: { token: "a".repeat(64), environment: "production" } });
    expect(r.status).toBe(503);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("PUSH_UNAVAILABLE");
  });
});

describe("diffs for a phone", () => {
  it("numbers lines with context and counts what changed", () => {
    const d = fileDiff("a\nb\nc\nd\n", "a\nb\nC\nd\ne\n", 100);
    expect(d.added).toBe(2);
    expect(d.removed).toBe(1);
    expect(d.truncated).toBe(false);
    const lines = d.hunks.flatMap((h) => h.lines);
    expect(lines.filter((l) => l.kind === "del")).toEqual([{ kind: "del", text: "c", old: 3, new: null }]);
    expect(lines.filter((l) => l.kind === "add").map((l) => [l.text, l.new])).toEqual([
      ["C", 3],
      ["e", 5],
    ]);
    expect(lines.find((l) => l.kind === "ctx")).toEqual({ kind: "ctx", text: "a", old: 1, new: 1 });
  });

  it("cuts off a large change and says so", () => {
    const big = Array.from({ length: 900 }, (_, i) => `line ${i}`).join("\n");
    const d = fileDiff("", big, 1_500);
    expect(d.truncated).toBe(true);
    expect(d.used).toBe(400);
    expect(d.added).toBe(900);
  });
});
