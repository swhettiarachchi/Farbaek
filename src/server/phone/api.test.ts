import { describe, expect, it } from "vitest";
import { DEMO_PROPOSAL_TASK_ID, DEMO_USER } from "@/content/demo-workspace";
import { createDemoReader } from "@/server/workspace/demo-reader";
import type { AppContext } from "@/server/workspace/context";
import { FILE_BODY_MAX, handlePhoneApi, LONG_TOKEN_MS, type PhoneApiDeps, type PhoneWrites } from "./api";
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
    // As the database does: the revision the person saw must still be the file's current one (0 when there's none).
    saveFile: async (p, i) => {
      calls.push(`saveFile:${i.path}@${i.expectedRevision}`);
      const current = await p.ctx.reader.getFile(p.orgId, i.projectId, i.path.replace(/^\.\//, ""));
      if ((current?.revision ?? 0) !== i.expectedRevision) return { ok: false, status: 409, code: "FILE_CHANGED", message: "Someone changed this file while you were looking at it." };
      return { ok: true, value: { revision: i.expectedRevision + 1 } };
    },
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

describe("buying a plan from the iPhone (ADR 0186)", () => {
  const UA_40 = "Farbaek/40 CFNetwork/1568.100.1 Darwin/24.0.0";

  it("tells the server which build is asking, so only builds that sell plans offer them", async () => {
    const { deps: d } = deps();
    const builds: (number | null)[] = [];
    const seen: PhoneApiDeps = { ...d, billing: async (_org, build) => (builds.push(build), { managedBy: null, live: false, applePurchases: true }) };
    await call(seen, "GET", "me", { headers: { "user-agent": UA_40 } });
    await call(seen, "GET", "me", { headers: { "user-agent": "Farbaek/22 CFNetwork/1568.100.1 Darwin/24.0.0" } });
    await call(seen, "GET", "me", { headers: { "user-agent": "Mozilla/5.0" } });
    await call(seen, "GET", "me", { headers: { "user-agent": "Farbaek/41 CFNetwork/1568.100.1 Darwin/24.0.0", "x-farbaek-app": "1.1.1+44" } });
    expect(builds).toEqual([40, 22, null, 44]);
  });

  it("opens Billing on the web signed in, on this workspace, at the plan's checkout, without the app's no-purchase mark", async () => {
    const { deps: d } = deps();
    const url = new URL((await data(await call(d, "POST", "billing-link", { body: { plan: "starter" } }))).url as string);
    expect(url.pathname).toBe("/auth/open");
    expect(url.searchParams.get("next")).toBe("/app/billing?choose=starter#billing-step");
    expect(url.searchParams.get("client")).toBe("web");
    expect(url.searchParams.get("ws")).toMatch(/^[0-9a-f-]{36}$/);
    expect(url.searchParams.get("token_hash")).toBe("abc123def456abc123def456");
  });

  it("opens Billing itself for a workspace already paying another way, and leaves a plan bought from Apple to the App Store", async () => {
    const { deps: d } = deps();
    // Paying on the web, or through Google Play (reported as "web"): Billing says how that plan changes.
    const web: PhoneApiDeps = { ...d, billing: async () => ({ managedBy: "web", live: true, applePurchases: true }) };
    const url = new URL((await data(await call(web, "POST", "billing-link", { body: { plan: "pro" } }))).url as string);
    expect(url.searchParams.get("next")).toBe("/app/billing");
    const apple: PhoneApiDeps = { ...d, billing: async () => ({ managedBy: "apple", live: true, applePurchases: true }) };
    expect((await call(apple, "POST", "billing-link", { body: { plan: "pro" } })).status).toBe(409);
  });

  it("opens the plan list for a plan it doesn't sell, and never for someone who isn't signed in", async () => {
    const { deps: d } = deps();
    for (const plan of ["enterprise", "free", "nonsense"]) {
      const url = new URL((await data(await call(d, "POST", "billing-link", { body: { plan } }))).url as string);
      expect(url.searchParams.get("next"), plan).toBe("/app/billing");
    }
    expect((await call(d, "POST", "billing-link", { body: { plan: "starter" }, token: false })).status).toBe(401);
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
    // A token minted an hour long and already a few seconds old, which is what a phone has after refreshing: it must pass.
    const fresh = deps({ expiresAt: NOW.getTime() / 1000 + 3600 - 5 });
    expect((await call(fresh.deps, "POST", `tasks/${DEMO_PROPOSAL_TASK_ID}/plan/approve`, { body })).status).toBe(200);
    expect(LONG_TOKEN_MS).toBeLessThan(55 * 60_000);
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

describe("a project's files on the phone (stage 182)", () => {
  type FileItem = { path: string; revision: number; sizeBytes: number; sha256: string; updatedAt: string; kind: string };
  type Problem = { error: { code: string; message: string; current?: { revision: number; sha256: string } | null } };
  const IMAGE = { path: "public/logo.png", revision: 2, sizeBytes: 8, sha256: "d".repeat(64), updatedAt: NOW.toISOString(), encoding: "base64" as const };
  // The demo's projects are text only, so this one has an image too, as a real project can (ADR 0108).
  function withImage() {
    const base = createDemoReader(NOW);
    return {
      ...base,
      listFiles: async (org: string, id: string) => [...(await base.listFiles(org, id)), IMAGE],
      getFile: async (org: string, id: string, path: string) => (path === IMAGE.path ? { ...IMAGE, content: "iVBORw0KGgo=" } : base.getFile(org, id, path)),
    };
  }
  const fileAt = (path: string, project = PROJECT) => `projects/${project}/file?path=${encodeURIComponent(path)}`;
  const listOf = async (d: PhoneApiDeps) => (await data(await call(d, "GET", `projects/${PROJECT}/files`))).files as FileItem[];

  it("lists a project's current files, text and images, without their content", async () => {
    const { deps: d } = deps({ ctx: { reader: withImage() } });
    const r = await data(await call(d, "GET", `projects/${PROJECT}/files`));
    expect(r).toMatchObject({ project: { id: PROJECT }, canSave: true, saveReason: null });
    const files = r.files as (FileItem & { content?: string })[];
    expect(files.find((f) => f.path === "README.md")).toMatchObject({ kind: "text", revision: expect.any(Number), sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(files.find((f) => f.path === IMAGE.path)).toEqual({ path: IMAGE.path, revision: 2, sizeBytes: 8, sha256: IMAGE.sha256, updatedAt: IMAGE.updatedAt, kind: "image" });
    expect(files.every((f) => f.content === undefined)).toBe(true);
  });

  it("reads a text file's content, and an image as base64 with its type", async () => {
    const { deps: d } = deps({ ctx: { reader: withImage() } });
    const readme = (await listOf(d)).find((f) => f.path === "README.md")!;
    const text = await data(await call(d, "GET", fileAt("README.md")));
    expect(text).toMatchObject({ ...readme, kind: "text", content: expect.stringContaining("#") });
    expect(text.base64).toBeUndefined();
    const image = await data(await call(d, "GET", fileAt(IMAGE.path)));
    expect(image).toMatchObject({ path: IMAGE.path, kind: "image", base64: "iVBORw0KGgo=", contentType: "image/png" });
    expect(image.content).toBeUndefined();
  });

  it("says a file or project isn't there, and refuses a path no file can have", async () => {
    const { deps: d } = deps();
    const missing = await call(d, "GET", fileAt("nowhere.md"));
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as Problem).error).toEqual({ code: "NOT_FOUND", message: "That file doesn't exist or isn't in this workspace." });
    for (const path of ["projects/not-a-uuid/files", fileAt("README.md", "not-a-uuid"), `projects/${NOWHERE}/files`]) {
      const r = await call(d, "GET", path);
      expect(r.status, path).toBe(404);
      expect(((await r.json()) as Problem).error.message, path).toBe("That project doesn't exist or isn't in this workspace.");
    }
    expect((await call(d, "GET", fileAt("README.md", NOWHERE))).status).toBe(404);
    for (const path of [`projects/${PROJECT}/file`, fileAt(""), fileAt("a\u0001b.md"), fileAt("a\u007f.md"), fileAt("x".repeat(301))]) {
      expect((await call(d, "GET", path)).status, path).toBe(400);
    }
  });

  it("saves a text file through the use case, and creates one from revision 0", async () => {
    const { deps: d, calls } = deps();
    const readme = (await listOf(d)).find((f) => f.path === "README.md")!;
    const saved = await call(d, "PUT", `projects/${PROJECT}/file`, { body: { path: "README.md", content: "# Changed\n", expectedRevision: readme.revision } });
    expect(saved.status).toBe(200);
    expect(await data(saved)).toEqual({ revision: readme.revision + 1 });
    const created = await call(d, "PUT", `projects/${PROJECT}/file`, { body: { path: " notes/todo.md ", content: "- one\n", expectedRevision: 0 } });
    expect(await data(created)).toEqual({ revision: 1 });
    expect(calls).toEqual([`saveFile:README.md@${readme.revision}`, "saveFile:notes/todo.md@0"]);
  });

  it("refuses a stale save with the file's current revision and hash, so the app can compare", async () => {
    const { deps: d } = deps();
    const readme = (await listOf(d)).find((f) => f.path === "README.md")!;
    const stale = await call(d, "PUT", `projects/${PROJECT}/file`, { body: { path: "README.md", content: "# Mine\n", expectedRevision: readme.revision - 1 } });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as Problem).error).toMatchObject({ code: "FILE_CHANGED", current: { revision: readme.revision, sha256: readme.sha256 } });
    // Saving over a file that was made meanwhile: its revision is there too.
    const raced = await call(d, "PUT", `projects/${PROJECT}/file`, { body: { path: "./README.md", content: "# Mine\n", expectedRevision: 0 } });
    expect(((await raced.json()) as Problem).error.current).toEqual({ revision: readme.revision, sha256: readme.sha256 });
  });

  it("refuses an image path in its own words, before any use case runs", async () => {
    const { deps: d, calls } = deps();
    for (const path of ["public/logo.png", "assets/Photo.JPG", "favicon.ico"]) {
      const r = await call(d, "PUT", `projects/${PROJECT}/file`, { body: { path, content: "not an image", expectedRevision: 0 } });
      expect(r.status, path).toBe(422);
      expect(((await r.json()) as Problem).error, path).toEqual({ code: "IMAGE_PATH", message: "That name ends like an image's, so it can only hold an image. Choose another name, or add images on the web." });
    }
    expect(calls).toEqual([]);
  });

  it("answers the sample's reads and refuses its save, and a viewer's, saying why", async () => {
    const { deps: d, calls } = deps();
    const sample = await data(await call(d, "GET", `sample/projects/${PROJECT}/files`, { token: false }));
    expect(sample).toMatchObject({ canSave: false, saveReason: "Sample." });
    expect((await call(d, "GET", `sample/${fileAt("README.md")}`, { token: false })).status).toBe(200);
    const write = await call(d, "PUT", `sample/projects/${PROJECT}/file`, { token: false, body: { path: "README.md", content: "x", expectedRevision: 1 } });
    expect(write.status).toBe(403);
    expect(((await write.json()) as Problem).error.code).toBe("SAMPLE_READ_ONLY");

    const viewer = deps({ ctx: { role: "viewer", writes: { enabled: false, reason: "You have view-only access to this workspace." } } });
    expect(await data(await call(viewer.deps, "GET", `projects/${PROJECT}/files`))).toMatchObject({ canSave: false, saveReason: "You have view-only access to this workspace." });
    expect((await call(viewer.deps, "PUT", `projects/${PROJECT}/file`, { body: { path: "README.md", content: "x", expectedRevision: 1 } })).status).toBe(403);
    expect([...calls, ...viewer.calls]).toEqual([]);
  });

  it("reads a whole text file's body, past the other routes' 64 KB, and refuses a larger one unread", async () => {
    const { deps: d, calls } = deps();
    const big = await call(d, "PUT", `projects/${PROJECT}/file`, { body: { path: "big.txt", content: "a".repeat(512 * 1024), expectedRevision: 0 } });
    expect(big.status).toBe(200);
    // Escaped, the same file can be up to six times longer, and that still fits.
    expect(JSON.stringify({ path: "big.txt", content: "\u001b".repeat(512 * 1024), expectedRevision: 0 }).length).toBeLessThan(FILE_BODY_MAX);
    const huge = await call(d, "PUT", `projects/${PROJECT}/file`, { body: { path: "huge.txt", content: "a".repeat(FILE_BODY_MAX), expectedRevision: 0 } });
    expect(huge.status).toBe(413);
    expect(((await huge.json()) as Problem).error).toEqual({ code: "FILE_TOO_LARGE", message: "Files can be up to 512 KB." });
    expect(calls).toEqual(["saveFile:big.txt@0"]);
    expect((await call(d, "PUT", `projects/${PROJECT}/file`, { body: { path: "x.md", content: "x" } })).status).toBe(400);
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
