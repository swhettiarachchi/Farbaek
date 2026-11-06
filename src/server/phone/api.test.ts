import { describe, expect, it } from "vitest";
import { DEMO_PROPOSAL_TASK_ID, DEMO_USER } from "@/content/demo-workspace";
import { createDemoReader } from "@/server/workspace/demo-reader";
import type { AppContext } from "@/server/workspace/context";
import { handlePhoneApi, type PhoneApiDeps, type PhoneWrites } from "./api";
import type { PhoneAuthDeps } from "./auth";
import { challengeFor } from "./tokens";
import { taskNextStep, type NextStepFacts } from "@/core/realityloop/next-step";
import { NO_RUNS, fileDiff, phoneNextStep } from "./views";

const SITE = "https://www.farbaek.com";
const JWT = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const NOW = new Date("2026-10-29T12:00:00Z");

async function demoContext(over: Partial<AppContext> = {}): Promise<AppContext> {
  const reader = createDemoReader(NOW);
  const workspaces = await reader.listWorkspaces();
  return { mode: "live", user: { ...DEMO_USER }, reader, workspaces, current: workspaces[0]!, role: "owner", permissions: {}, writes: { enabled: true }, ...over };
}

const NONCE = "n0nce-n0nce-n0nce-n0nce-n0nce-n0nce";

function deps(options: { expiresAt?: number; ctx?: Partial<AppContext>; revoked?: boolean; apple?: boolean } = {}) {
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
      signInToken: async () => "abc123def456abc123def456",
      refresh: async () => null,
      verify: async (t) => (t === JWT ? { userId: DEMO_USER.id, email: DEMO_USER.email, sessionId: "s1", expiresAt: options.expiresAt ?? NOW.getTime() / 1000 + 3600 } : null),
      // Auth checks Apple's token and nonce; here only one pair passes.
      appleSession: async (token, nonce) => (token === JWT && nonce === NONCE ? { userId: DEMO_USER.id, session: { accessToken: JWT, refreshToken: "refresh-apple1", expiresAt: 2_000_000_000, sessionId: "s2" } } : null),
    },
    keepApple: async (_user, code) => void calls.push(`keepApple:${code}`),
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
    createWorkspace: async () => (calls.push("createWorkspace"), { ok: true, value: { workspaceId: "w" } }),
    report: async (_c, i) => (calls.push(`report:${i.subject}|${i.body}`), { ok: true, value: { requestId: "r1" } }),
    appleTransaction: async () => (calls.push("apple"), { ok: true, value: { state: "active", planId: "starter", paidThrough: null } }),
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
    appleSignIn: () => options.apple ?? true,
    googleSignIn: async () => options.apple ?? true,
    billing: async () => ({ managedBy: null, live: false, applePurchases: true }),
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

const TASK = "00000000-0000-4000-8000-00000000b007";
const PROJECT = "00000000-0000-4000-8000-00000000a001";
const NOWHERE = "00000000-0000-4000-8000-0000000000ff";

describe("a page the app has no screen for (ADR 0177)", () => {
  it("opens signed in, by a one-time link back to the same page", async () => {
    const { deps: d } = deps();
    const url = new URL((await data(await call(d, "POST", "web-link", { body: { path: "app/sandbox" } }))).url as string);
    expect(url.pathname).toBe("/auth/open");
    expect(url.searchParams.get("next")).toBe("/app/sandbox");
    expect(url.searchParams.get("token_hash")).toBe("abc123def456abc123def456");
  });

  it("only opens pages of the app, never somewhere else", async () => {
    const { deps: d } = deps();
    for (const path of ["https://evil.example", "//evil.example", "app/../../evil", "app/x?next=https://evil.example", "pricing", "sign-in", "app/sandbox#x", "app/%2e%2e/evil", "app/.hidden"]) {
      expect((await call(d, "POST", "web-link", { body: { path } })).status, path).toBe(400);
    }
  });

  it("doesn't hand a sign-in to someone who isn't signed in on the phone", async () => {
    const { deps: d } = deps();
    expect((await call(d, "POST", "web-link", { body: { path: "app/sandbox" }, token: false })).status).toBe(401);
  });
});

describe("the iPhone app's next step, projects and reports (ADR 0173)", () => {
  const stepOf = async (d: PhoneApiDeps, id: string) => (await data(await call(d, "GET", `tasks/${id}`))).nextStep as { tone: string; title: string; body: string; action: { label: string; target: string } | null };

  it("says the web's next step on a task, with a native action where the app has a screen", async () => {
    const { deps: d } = deps();
    expect(await stepOf(d, TASK)).toMatchObject({ tone: "action", title: "The agent finished. Check what changed, then approve", action: { label: "Review the change", target: "change" } });
  });

  it("sends anything the app has no screen for to the web, and says so", async () => {
    const { deps: d } = deps();
    // A cancelled task leads to its project, which the app has; a verified one too.
    expect(await stepOf(d, "00000000-0000-4000-8000-00000000b006")).toMatchObject({ title: "This task was cancelled", action: { target: "project" } });
    // An approved plan can't start from the app yet, and it doesn't pretend it can.
    const approved = await stepOf(d, "00000000-0000-4000-8000-00000000b008");
    expect(approved.title).toBe("Your plan is approved");
    expect(approved.body).toContain("on the web");
    expect(approved.action).toEqual({ label: "Open on the web", target: "web" });
  });

  const FACTS: NextStepFacts = { state: "RECEIVED", hasChange: false, changeExpired: false, canApprove: true, canAct: true, run: "none", fix: "none", canBuild: false, sandboxed: true, checking: false, checks: 1, canFix: false, canUndo: false };
  const phone = (over: Partial<NextStepFacts>, hasPlan = true) => {
    const facts = { ...FACTS, ...over };
    return phoneNextStep(taskNextStep(facts), { state: facts.state, hasChange: facts.hasChange, hasPlan, approvedWithNoRun: false }).action;
  };
  const WEB = { label: "Open on the web", target: "web" };

  it("opens the plan screen only to read or approve a plan, which is all it can do", () => {
    expect(phone({ state: "CONTRACT_DRAFTED" })).toEqual({ label: "Read the plan", target: "plan" });
    // Writing one and changing one are on the web, so the button doesn't land on "There's no plan yet".
    expect(phone({ state: "RECEIVED" }, false)).toEqual(WEB);
    expect(phone({ state: "CONTEXT_ASSEMBLED" }, false)).toEqual(WEB);
    expect(phone({ state: "BLOCKED" })).toEqual(WEB);
    expect(phone({ state: "APPROVAL_PENDING" }, false)).toEqual(WEB);
  });

  it("opens the web page where the words offer undo, not a project that has none", () => {
    expect(phone({ state: "FAILED" })).toEqual(WEB);
    expect(phone({ state: "INTERRUPTED" })).toEqual(WEB);
    expect(phone({ state: "VERIFYING", sandboxed: false })).toEqual(WEB);
    expect(phone({ state: "VERIFYING", checks: 0 })).toEqual(WEB);
    expect(phone({ state: "VERIFIED" })).toEqual({ label: "Open the project", target: "project" });
    expect(phone({ state: "RECOVERED" })).toEqual({ label: "Open the project", target: "project" });
  });

  it("isn't anyone's turn in an archived project, as on the web", async () => {
    const base = createDemoReader(NOW);
    const reader = { ...base, getProject: async (org: string, id: string) => {
      const project = await base.getProject(org, id);
      return project && { ...project, archivedAt: NOW.toISOString() };
    } };
    const { deps: d } = deps({ ctx: { reader } });
    expect(await stepOf(d, TASK)).toMatchObject({ tone: "idle", title: "This change needs someone else's approval", action: { label: "See the change", target: "change" } });
    // The card says the reason is next to the button, so it has to be.
    const archived = "This project is archived, so nothing in it can change.";
    expect(await data(await call(d, "GET", `approvals/${TASK}`))).toMatchObject({ canApprove: false, approveReason: archived });
    expect(await data(await call(d, "GET", `tasks/${TASK}/plan`))).toMatchObject({ canApprove: false, approveReason: archived });
  });

  it("isn't anyone's turn who can only look", async () => {
    const { deps: d } = deps({ ctx: { mode: "live", role: "viewer" } });
    expect(await stepOf(d, TASK)).toMatchObject({ tone: "idle", title: "This change needs someone else's approval", action: { label: "See the change", target: "change" } });
  });

  it("opens a project with its tasks, and refuses what isn't one", async () => {
    const { deps: d } = deps();
    const r = await data(await call(d, "GET", `projects/${PROJECT}`));
    expect((r.project as { id: string }).id).toBe(PROJECT);
    expect((r.tasks as unknown[]).length).toBeGreaterThan(0);
    expect(r.address).toBeNull();
    expect((await call(d, "GET", `projects/${NOWHERE}`)).status).toBe(404);
    expect((await call(d, "GET", "projects/not-a-uuid")).status).toBe(404);
  });

  it("says where a project is live, and survives not being able to read it", async () => {
    const { deps: d } = deps();
    const live = d.live.bind(d);
    d.live = async (c, w) => ({ ...(await live(c, w)), liveAddress: async () => "https://sweet-crumbs.farbaek.si" });
    expect((await data(await call(d, "GET", `projects/${PROJECT}`))).address).toBe("https://sweet-crumbs.farbaek.si");
    d.live = async (c, w) => ({ ...(await live(c, w)), liveAddress: async () => { throw new Error("no") } });
    const stillOpens = await call(d, "GET", `projects/${PROJECT}`);
    expect(stillOpens.status).toBe(200);
    expect((await data(stillOpens)).address).toBeNull();
  });

  it("takes a report of a task or a project, named from the record and not from what's typed", async () => {
    const { deps: d, calls } = deps();
    const r = await call(d, "POST", "reports", { body: { taskId: TASK, reason: "It wrote something offensive." } });
    expect(r.status).toBe(201);
    expect(calls.at(-1)).toContain("report:Report: Reject fractional quantities in the cart|About: Reject fractional");
    expect(calls.at(-1)).toContain(`Where: /app/tasks/${TASK}`);
    expect(calls.at(-1)).toContain("It wrote something offensive.");
    expect((await call(d, "POST", "reports", { body: { projectId: PROJECT, reason: "Copied a real brand." } })).status).toBe(201);
  });

  it("refuses a report that's unclear, too long, about nothing it can read, or from the sample", async () => {
    const { deps: d } = deps();
    const status = async (body: unknown) => (await call(d, "POST", "reports", { body })).status;
    expect(await status({ reason: "No record named." })).toBe(400);
    expect(await status({ taskId: TASK, projectId: PROJECT, reason: "Both named." })).toBe(400);
    expect(await status({ taskId: TASK, reason: "   " })).toBe(400);
    expect(await status({ taskId: TASK, reason: "x".repeat(1_001) })).toBe(400);
    expect(await status({ taskId: "not-a-uuid", reason: "Bad id." })).toBe(400);
    expect(await status({ taskId: NOWHERE, reason: "Not in this workspace." })).toBe(404);
    expect((await call(d, "POST", "sample/reports", { token: false, body: { taskId: TASK, reason: "From the sample." } })).status).toBe(403);
  });

  it("lets a viewer report, because reporting isn't changing anything", async () => {
    const { deps: d } = deps({ ctx: { mode: "live", role: "viewer", writes: { enabled: false, reason: "Read only." } } });
    expect((await call(d, "POST", "reports", { body: { taskId: TASK, reason: "Report from a viewer." } })).status).toBe(201);
  });
});

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

  it("answers the account with the person's own workspace when the phone names one they aren't in", async () => {
    // A phone that last showed the sample, or another account, still holds that workspace; the app adopts `current`.
    const stale = { headers: { "x-farbaek-workspace": crypto.randomUUID() } };
    const r = await call(deps().deps, "GET", "me", stale);
    expect(r.status).toBe(200);
    const ws = (await createDemoReader(NOW).listWorkspaces())[0]!;
    expect(((await r.json()) as { data: { current: string } }).data.current).toBe(ws.id);
    expect((await call(deps().deps, "GET", "tasks", stale)).status).toBe(404);
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

  it("takes an App Store purchase from a connected phone, never from the sample (ADR 0112)", async () => {
    const { deps: d, calls } = deps();
    const me = await data(await call(d, "GET", "me"));
    expect(me.billing).toMatchObject({ managedBy: null, applePurchases: true, canManage: true });
    expect((await call(d, "POST", "apple/transactions", { body: { jws: "a".repeat(40) } })).status).toBe(200);
    expect(calls).toEqual(["apple"]);
    expect((await call(d, "POST", "sample/apple/transactions", { token: false, body: { jws: "a".repeat(40) } })).status).toBe(403);
    expect((await call(d, "POST", "apple/transactions", { body: { jws: "short" } })).status).toBe(400);
  });

  it("signs in with Apple only when it's open, and records the phone like any other (ADR 0113)", async () => {
    expect(await data(await call(deps({ apple: false }).deps, "GET", "sign-in-options", { token: false }))).toEqual({ apple: false, google: false });
    const off = await call(deps({ apple: false }).deps, "POST", "apple", { token: false, body: { identityToken: JWT, nonce: NONCE } });
    expect(off.status).toBe(503);

    const { deps: d, calls } = deps();
    expect(await data(await call(d, "GET", "sign-in-options", { token: false }))).toEqual({ apple: true, google: true });
    const signedIn = await call(d, "POST", "apple", { token: false, body: { identityToken: JWT, nonce: NONCE, authorizationCode: "c0de.0.abc", device: "Ada's iPhone", appVersion: "1.0" } });
    expect(signedIn.status).toBe(200);
    expect(await data(signedIn)).toMatchObject({ accessToken: JWT, refreshToken: "refresh-apple1", deviceId: "device-1" });
    expect(calls).toEqual(["keepApple:c0de.0.abc"]);

    // A token or nonce Auth won't accept signs nobody in, and the code isn't kept.
    for (const body of [{ identityToken: JWT, nonce: "x".repeat(40) }, { identityToken: JWT, nonce: "short" }, { identityToken: "not-a-token", nonce: NONCE }]) {
      const r = await call(d, "POST", "apple", { token: false, body: { ...body, authorizationCode: "c0de.0.xyz" } });
      expect(r.status).toBe(400);
      expect(((await r.json()) as { error: { code: string } }).error.code).toBe("APPLE_REFUSED");
    }
    expect(calls).toEqual(["keepApple:c0de.0.abc"]);
  });

  it("makes a first workspace from the phone, never a second, never in the sample", async () => {
    const empty = deps({ ctx: { workspaces: [], current: null, role: null } });
    expect((await call(empty.deps, "POST", "workspaces")).status).toBe(201);
    expect(empty.calls).toEqual(["createWorkspace"]);
    const has = deps();
    expect((await call(has.deps, "POST", "workspaces")).status).toBe(409);
    expect((await call(has.deps, "POST", "sample/workspaces", { token: false })).status).toBe(403);
    expect(has.calls).toEqual([]);
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
