/**
 * Farbaek's API for its phone apps, /api/v1/app (ADR 0110). One router so
 * every route gets the same checks in the same order:
 *
 * - sign-in steps (connect, token, apple, refresh) carry their own credential,
 *   and GET sign-in-options says which ways to sign in this server offers;
 * - everything else needs a connected phone's access token, checked against
 *   its device record on every request;
 * - /api/v1/app/sample/... answers the same reads from the sample workspace,
 *   with no account, and refuses every write;
 * - a write says why it can't happen (view-only, paused, no workspace) with
 *   the web app's own words, before any use case runs.
 *
 * Reads go through the WorkspaceReader as the person, so Row Level Security
 * decides what's visible; writes go through the same use cases as the web.
 */
import { IOS_APP_CLIENT, iosAppBuild } from "@/core/billing/store-client";
import { isPaidPlanId } from "@/core/billing/provider-state";
import { z } from "zod";
import { CAP_CHOICES, type CapChoice } from "@/core/agent/run-cap";
import { EFFORTS, type Effort } from "@/core/agent/routing";
import { CLOUD_RUN_MAX_MINUTES } from "@/core/agent/cloud-run";
import { json, problem } from "@/server/sandbox/http";
import type { AppContext } from "@/server/workspace/context";
import { MANAGER_ROLES } from "@/server/workspace/types";
import { authenticate, connectFromBrowser, exchangeCode, refreshPhone, signInWithApple, type PhoneAuthDeps, type PhoneCaller } from "./auth";
import { PUSH_TOKEN_PATTERN } from "./tokens";
import { approvalView, approvalsView, homeView, isTaskFilter, meView, planView, projectView, projectsView, runDetail, taskView, tasksView, type BillingFacts, type RunReader } from "./views";
import { readTextCapped } from "@/server/http/body";
import { log } from "@/server/observability/log";
import { reportPrefill } from "@/core/support/support";

export type PhoneOutcome<T> = { ok: true; value: T } | { ok: false; status: number; code: string; message: string };

/** The person a write acts for: their context, their phone, and their session for Row Level Security. */
export interface PhonePerson {
  ctx: AppContext;
  orgId: string;
  caller: PhoneCaller;
}

export interface PhoneWrites {
  approve(p: PhonePerson, input: { taskId: string; proposalId: string; sha256: string }): Promise<PhoneOutcome<{ written: number; checking: boolean }>>;
  discard(p: PhonePerson, input: { taskId: string; proposalId: string }): Promise<PhoneOutcome<null>>;
  build(p: PhonePerson, input: { prompt: string; projectId: string | null; effort: Effort }): Promise<PhoneOutcome<{ taskId: string; projectId: string; planned: boolean; planNote: string | null }>>;
  approvePlan(p: PhonePerson, input: { taskId: string; version: number; sha256: string; expectedTaskVersion: number; effort: Effort; cap: CapChoice }): Promise<PhoneOutcome<{ runId: string | null; startNote: string | null }>>;
  answerRun(p: PhonePerson, input: { runId: string; requestId: string; approved: boolean; bindingHash: string }): PhoneOutcome<null>;
  stopRun(p: PhonePerson, runId: string): PhoneOutcome<null>;
  messageRun(p: PhonePerson, input: { runId: string; text: string }): PhoneOutcome<null>;
  setPush(caller: PhoneCaller, token: string | null, environment: "production" | "development"): Promise<boolean>;
  signOut(caller: PhoneCaller): Promise<"signed_out" | "refused" | "not_found">;
  /** The person's first workspace, "My workspace", made the way the web's build box makes it (the database applies the trial rules). */
  createWorkspace(caller: PhoneCaller): Promise<PhoneOutcome<{ workspaceId: string }>>;
  /** Someone reporting what the AI made (ADR 0173), as the person. It goes in with the abuse topic, whatever the workspace's state. */
  report(caller: PhoneCaller, input: { orgId: string; subject: string; body: string }): Promise<PhoneOutcome<{ requestId: string }>>;
  /** A purchase the app made with Apple's In-App Purchase (ADR 0112): its signed transaction. */
  appleTransaction(p: PhonePerson, jws: string): Promise<PhoneOutcome<{ state: string; planId: string | null; paidThrough: string | null }>>;
}

export interface PhoneApiDeps {
  /** Null when accounts aren't configured on this server: only the sample works. */
  auth: PhoneAuthDeps | null;
  siteOrigin: string;
  /** The person signed in in this browser, for the connect form. */
  browserUser(): Promise<string | null>;
  live(caller: PhoneCaller, workspaceId: string | null): Promise<{ ctx: AppContext; runs: RunReader; liveAddress?: (projectId: string) => Promise<string | null> }>;
  sample(): Promise<{ ctx: AppContext; runs: RunReader; liveAddress?: (projectId: string) => Promise<string | null> }>;
  execution(): { mode: string; reason?: string };
  writes: PhoneWrites;
  pushAvailable(): boolean;
  /** Whether Sign in with Apple is open on this server (ADR 0113). */
  appleSignIn(): boolean;
  /** Whether the website's sign-in, which the app opens, offers Google now (ADR 0115). */
  googleSignIn(): Promise<boolean>;
  /** Who bills a workspace, and whether this build of the app may offer App Store plans (ADR 0112, ADR 0186). */
  billing(orgId: string, build: number | null): Promise<BillingFacts>;
  clientKey(request: Request): string;
  now(): Date;
}

type Params = Record<string, string>;
interface Scope {
  request: Request;
  params: Params;
  url: URL;
  ctx: AppContext;
  runs: RunReader;
  liveAddress?: (projectId: string) => Promise<string | null>;
  caller: PhoneCaller | null;
  deps: PhoneApiDeps;
}

type Handler = (s: Scope) => Promise<Response>;
interface Route {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  /** A write: refused in the sample, and when the person can't change this workspace. */
  write?: boolean;
  /** A write that starts sandbox work, which runs on the phone's access token, so it must outlast a run. */
  long?: boolean;
  /**
   * Reads the account itself. A workspace the person isn't in (a phone that last showed the
   * sample or another account) is ignored, and the answer names their current one, which the
   * app adopts. Every other route refuses it.
   */
  anyWorkspace?: boolean;
  run: Handler;
}

/** Longer than this and it's a support conversation, which the web's Help is for. */
export const REPORT_REASON_MAX = 1_000;

const SAMPLE_READ_ONLY = "This is sample data, so nothing here can change. Sign in to approve and build for real.";
const ok = (data: unknown, status = 200) => json({ data }, status);
const fromOutcome = <T>(r: PhoneOutcome<T>, status = 200) => (r.ok ? ok(r.value, status) : problem(r.status, r.code, r.message));
const notFound = (what: string) => problem(404, "NOT_FOUND", `That ${what} doesn't exist or isn't in this workspace.`);
const Uuid = z.uuid();
const Sha = z.string().regex(/^[0-9a-f]{64}$/);

async function body(request: Request): Promise<Record<string, unknown> | null> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return null;
  const text = await readTextCapped(request, 64 * 1024);
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const badBody = () => problem(400, "INVALID_REQUEST", "That request isn't valid. Update the app and try again.");

/**
 * Which build of the iPhone app is asking (ADR 0186). An iPhone whose build can't be read is logged, so a User-Agent
 * that stopped matching shows in the logs instead of quietly hiding the plans from everyone.
 */
function buildOf(s: Scope): number | null {
  const ua = s.request.headers.get("user-agent");
  const build = iosAppBuild(ua, s.request.headers.get("x-farbaek-app"));
  if (build === null && ua?.includes("CFNetwork/")) log("warn", "phone.build_unknown", { userAgent: ua.slice(0, 80) });
  return build;
}

/** The person behind a write, or why they can't write here. */
function person(s: Scope): PhonePerson | Response {
  if (!s.caller) return problem(403, "SAMPLE_READ_ONLY", SAMPLE_READ_ONLY);
  if (!s.ctx.current) return problem(409, "NO_WORKSPACE", "Make a workspace first.");
  if (!s.ctx.writes.enabled) return problem(403, "READ_ONLY", s.ctx.writes.reason);
  return { ctx: s.ctx, orgId: s.ctx.current.id, caller: s.caller };
}

function orgOf(s: Scope): string | Response {
  return s.ctx.current?.id ?? problem(409, "NO_WORKSPACE", "Make a workspace first.");
}

const ROUTES: Route[] = [
  {
    method: "GET",
    path: "me",
    anyWorkspace: true,
    run: async (s) =>
      ok(
        meView(s.ctx, {
          push: { available: s.caller !== null && s.deps.pushAvailable(), on: s.caller?.push ?? false },
          billing: s.caller && s.ctx.current ? await s.deps.billing(s.ctx.current.id, buildOf(s)) : null,
        }),
      ),
  },
  {
    method: "GET",
    path: "home",
    run: async (s) => {
      const org = orgOf(s);
      return typeof org === "string" ? ok(await homeView(s.ctx, org, s.runs, s.deps.now())) : org;
    },
  },
  {
    method: "GET",
    path: "approvals",
    run: async (s) => {
      const org = orgOf(s);
      return typeof org === "string" ? ok(await approvalsView(s.ctx, org, s.deps.execution(), s.deps.now())) : org;
    },
  },
  {
    method: "GET",
    path: "approvals/:taskId",
    run: async (s) => {
      const org = orgOf(s);
      if (typeof org !== "string") return org;
      if (!Uuid.safeParse(s.params.taskId).success) return notFound("change");
      const view = await approvalView(s.ctx, org, s.params.taskId!, s.deps.execution());
      return view ? ok(view) : notFound("change");
    },
  },
  {
    // A page the app has no screen for, opened signed in, in its in-app browser (ADR 0177).
    method: "POST",
    path: "web-link",
    anyWorkspace: true,
    run: async (s) => {
      const parsed = z.object({ path: z.string().max(300).regex(/^app(\/(?!\.)[A-Za-z0-9._~-]+)*$/) }).safeParse(await body(s.request));
      if (!parsed.success) return badBody();
      const page = `/${parsed.data.path}`;
      const plain = `${s.deps.siteOrigin}${page}?client=${IOS_APP_CLIENT}`;
      // Without a token the page still opens: the person signs in there, as they did before.
      const auth = s.deps.auth;
      if (!s.caller || !auth || !(await auth.store.rateLimit(`phone-web-link:${s.caller.userId}`, 60, 30))) return ok({ url: plain });
      const token = await auth.auth.signInToken(s.caller.userId).catch(() => null);
      return ok({ url: token ? `${s.deps.siteOrigin}/auth/open?${new URLSearchParams({ token_hash: token, next: page })}` : plain });
    },
  },
  {
    // Paying on the website from the iPhone, where Apple allows a link to it: the United States App Store (ADR 0186).
    // The app opens this in Safari, signed in, on this workspace, at the chosen plan's checkout: a tick and a card.
    method: "POST",
    path: "billing-link",
    run: async (s) => {
      const parsed = z.object({ plan: z.string().max(40).optional() }).safeParse(await body(s.request));
      if (!parsed.success) return badBody();
      const org = orgOf(s);
      if (typeof org !== "string") return org;
      if (!s.ctx.role || !MANAGER_ROLES.includes(s.ctx.role)) return problem(403, "FORBIDDEN", "Owners and admins choose plans.");
      // A self-serve paid plan, or the plan list. Enterprise is a contract, so it isn't one.
      const plan = parsed.data.plan && isPaidPlanId(parsed.data.plan) ? parsed.data.plan : null;
      // Paying through Apple: plans change in the App Store. Already paying another way (the web, or Google Play, which this
      // reports as "web"): Billing itself, which says how that plan changes. Otherwise straight to the plan's checkout.
      const facts = await s.deps.billing(org, buildOf(s));
      if (facts.managedBy === "apple") return problem(409, "BILLED_BY_APPLE", "This workspace's plan is billed through the App Store, so it's changed there.");
      const page = plan && !facts.live ? `/app/billing?choose=${plan}#billing-step` : "/app/billing";
      const plain = `${s.deps.siteOrigin}${page}`;
      const auth = s.deps.auth;
      if (!s.caller || !auth || !(await auth.store.rateLimit(`phone-billing-link:${s.caller.userId}`, 60, 10))) return ok({ url: plain });
      const token = await auth.auth.signInToken(s.caller.userId).catch(() => null);
      return ok({ url: token ? `${s.deps.siteOrigin}/auth/open?${new URLSearchParams({ token_hash: token, next: page, client: "web", ws: org })}` : plain });
    },
  },
  {
    method: "POST",
    path: "approvals/:taskId/approve",
    write: true,
    long: true,
    run: async (s) => {
      const p = person(s);
      if (p instanceof Response) return p;
      const parsed = z.object({ proposalId: Uuid, sha256: Sha }).safeParse(await body(s.request));
      if (!parsed.success || !Uuid.safeParse(s.params.taskId).success) return badBody();
      return fromOutcome(await s.deps.writes.approve(p, { taskId: s.params.taskId!, ...parsed.data }));
    },
  },
  {
    method: "POST",
    path: "approvals/:taskId/discard",
    write: true,
    run: async (s) => {
      const p = person(s);
      if (p instanceof Response) return p;
      const parsed = z.object({ proposalId: Uuid }).safeParse(await body(s.request));
      if (!parsed.success || !Uuid.safeParse(s.params.taskId).success) return badBody();
      return fromOutcome(await s.deps.writes.discard(p, { taskId: s.params.taskId!, ...parsed.data }));
    },
  },
  {
    method: "GET",
    path: "tasks",
    run: async (s) => {
      const org = orgOf(s);
      if (typeof org !== "string") return org;
      const filter = s.url.searchParams.get("filter") ?? "all";
      return ok(await tasksView(s.ctx.reader, org, isTaskFilter(filter) ? filter : "all"));
    },
  },
  {
    method: "GET",
    path: "tasks/:taskId",
    run: async (s) => {
      const org = orgOf(s);
      if (typeof org !== "string") return org;
      if (!Uuid.safeParse(s.params.taskId).success) return notFound("task");
      const view = await taskView(s.ctx, org, s.params.taskId!, s.runs, s.deps.execution(), s.deps.now());
      return view ? ok(view) : notFound("task");
    },
  },
  {
    method: "GET",
    path: "tasks/:taskId/plan",
    run: async (s) => {
      const org = orgOf(s);
      if (typeof org !== "string") return org;
      if (!Uuid.safeParse(s.params.taskId).success) return notFound("task");
      const view = await planView(s.ctx, org, s.params.taskId!);
      return view ? ok(view) : notFound("task");
    },
  },
  {
    method: "POST",
    path: "tasks/:taskId/plan/approve",
    write: true,
    long: true,
    run: async (s) => {
      const p = person(s);
      if (p instanceof Response) return p;
      const parsed = z
        .object({
          version: z.number().int().positive(),
          sha256: Sha,
          expectedTaskVersion: z.number().int().nonnegative(),
          effort: z.enum(EFFORTS).catch("balanced"),
          cap: z.enum(CAP_CHOICES).catch("double"),
        })
        .safeParse(await body(s.request));
      if (!parsed.success || !Uuid.safeParse(s.params.taskId).success) return badBody();
      return fromOutcome(await s.deps.writes.approvePlan(p, { taskId: s.params.taskId!, ...parsed.data }));
    },
  },
  {
    method: "POST",
    path: "builds",
    write: true,
    run: async (s) => {
      const p = person(s);
      if (p instanceof Response) return p;
      const parsed = z
        .object({ prompt: z.string().min(1).max(4_000), projectId: Uuid.nullable().optional(), effort: z.enum(EFFORTS).catch("balanced") })
        .safeParse(await body(s.request));
      if (!parsed.success) return badBody();
      return fromOutcome(await s.deps.writes.build(p, { prompt: parsed.data.prompt, projectId: parsed.data.projectId ?? null, effort: parsed.data.effort }), 201);
    },
  },
  {
    method: "GET",
    path: "runs/:runId",
    run: async (s) => {
      if (!Uuid.safeParse(s.params.runId).success) return notFound("run");
      const after = z.coerce.number().int().nonnegative().catch(0).parse(s.url.searchParams.get("after") ?? 0);
      const manager = s.ctx.role !== null && MANAGER_ROLES.includes(s.ctx.role);
      const view = await runDetail(s.runs, s.params.runId!, after, { userId: s.ctx.user.id, manager });
      return view ? ok(view) : notFound("run");
    },
  },
  {
    method: "POST",
    path: "runs/:runId/answer",
    write: true,
    run: async (s) => {
      const p = person(s);
      if (p instanceof Response) return p;
      const parsed = z.object({ requestId: z.string().min(1).max(200), approved: z.boolean(), bindingHash: Sha }).safeParse(await body(s.request));
      if (!parsed.success || !Uuid.safeParse(s.params.runId).success) return badBody();
      return fromOutcome(s.deps.writes.answerRun(p, { runId: s.params.runId!, ...parsed.data }));
    },
  },
  {
    method: "POST",
    path: "runs/:runId/stop",
    write: true,
    run: async (s) => {
      const p = person(s);
      if (p instanceof Response) return p;
      if (!Uuid.safeParse(s.params.runId).success) return badBody();
      return fromOutcome(s.deps.writes.stopRun(p, s.params.runId!));
    },
  },
  {
    method: "POST",
    path: "runs/:runId/message",
    write: true,
    run: async (s) => {
      const p = person(s);
      if (p instanceof Response) return p;
      const parsed = z.object({ text: z.string().min(1).max(2_000) }).safeParse(await body(s.request));
      if (!parsed.success || !Uuid.safeParse(s.params.runId).success) return badBody();
      return fromOutcome(s.deps.writes.messageRun(p, { runId: s.params.runId!, text: parsed.data.text }));
    },
  },
  {
    method: "GET",
    path: "projects",
    run: async (s) => {
      const org = orgOf(s);
      return typeof org === "string" ? ok(await projectsView(s.ctx.reader, org)) : org;
    },
  },
  {
    method: "GET",
    path: "projects/:projectId",
    run: async (s) => {
      const org = orgOf(s);
      if (typeof org !== "string") return org;
      if (!Uuid.safeParse(s.params.projectId).success) return notFound("project");
      const view = await projectView(s.ctx.reader, org, s.params.projectId!, s.liveAddress);
      return view ? ok(view) : notFound("project");
    },
  },
  {
    // Not a workspace write: a viewer can report, and so can anyone in a paused workspace. The record's name is read
    // as the person, so nothing typed names it, and another workspace's record is simply not found.
    method: "POST",
    path: "reports",
    run: async (s) => {
      if (!s.caller) return problem(403, "SAMPLE_READ_ONLY", SAMPLE_READ_ONLY);
      const org = orgOf(s);
      if (typeof org !== "string") return org;
      const raw = await body(s.request);
      const parsed = z.object({ taskId: Uuid.optional(), projectId: Uuid.optional(), reason: z.string().trim().min(1).max(REPORT_REASON_MAX) }).safeParse(raw);
      if (!parsed.success || Boolean(parsed.data.taskId) === Boolean(parsed.data.projectId)) return badBody();
      const { taskId, projectId, reason } = parsed.data;
      const about = taskId ? (await s.ctx.reader.getTask(org, taskId))?.task : await s.ctx.reader.getProject(org, projectId!);
      if (!about) return notFound(taskId ? "task" : "project");
      const opening = taskId
        ? reportPrefill({ name: (about as { title: string }).title, path: `/app/tasks/${taskId}` })
        : reportPrefill({ name: (about as { name: string }).name, path: `/app/projects/${projectId}` });
      return fromOutcome(await s.deps.writes.report(s.caller, { orgId: org, subject: opening.subject, body: `${opening.body}${reason}` }), 201);
    },
  },
  {
    method: "POST",
    path: "workspaces",
    run: async (s) => {
      if (!s.caller) return problem(403, "SAMPLE_READ_ONLY", SAMPLE_READ_ONLY);
      if (s.ctx.workspaces.length > 0) return problem(409, "HAS_WORKSPACE", "You already have a workspace. Pull to refresh to open it.");
      return fromOutcome(await s.deps.writes.createWorkspace(s.caller), 201);
    },
  },
  {
    method: "POST",
    path: "apple/transactions",
    write: true,
    run: async (s) => {
      const p = person(s);
      if (p instanceof Response) return p;
      const parsed = z.object({ jws: z.string().min(20).max(64_000) }).safeParse(await body(s.request));
      if (!parsed.success) return badBody();
      return fromOutcome(await s.deps.writes.appleTransaction(p, parsed.data.jws));
    },
  },
  {
    method: "PUT",
    path: "push",
    run: async (s) => {
      if (!s.caller) return problem(403, "SAMPLE_READ_ONLY", SAMPLE_READ_ONLY);
      if (!s.deps.pushAvailable()) return problem(503, "PUSH_UNAVAILABLE", "Notifications on iPhone aren't set up on Farbaek's server yet. You'll still see everything when you open the app.");
      const parsed = z.object({ token: z.string().regex(PUSH_TOKEN_PATTERN), environment: z.enum(["production", "development"]) }).safeParse(await body(s.request));
      if (!parsed.success) return badBody();
      return (await s.deps.writes.setPush(s.caller, parsed.data.token.toLowerCase(), parsed.data.environment)) ? ok({ on: true }) : problem(401, "DISCONNECTED", "This phone was disconnected. Sign in again.");
    },
  },
  {
    method: "DELETE",
    path: "push",
    run: async (s) => {
      if (!s.caller) return problem(403, "SAMPLE_READ_ONLY", SAMPLE_READ_ONLY);
      await s.deps.writes.setPush(s.caller, null, "production");
      return ok({ on: false });
    },
  },
  {
    method: "DELETE",
    path: "session",
    run: async (s) => {
      if (!s.caller) return ok({ signedOut: true });
      const r = await s.deps.writes.signOut(s.caller);
      return ok({ signedOut: r !== "not_found" });
    },
  },
];

function match(route: Route, method: string, segments: readonly string[]): Params | null {
  if (route.method !== method) return null;
  const parts = route.path.split("/");
  if (parts.length !== segments.length) return null;
  const params: Params = {};
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part.startsWith(":")) params[part.slice(1)] = segments[i]!;
    else if (part !== segments[i]) return null;
  }
  return params;
}

/**
 * Long enough for a cloud run and its checks in a fresh test space: a phone
 * refreshes first when its token is closer to expiring. Access tokens live an
 * hour, so the margin has to be well under that or no token, however fresh,
 * could ever pass (a token one network hop old is already short of an hour).
 */
export const LONG_TOKEN_MS = (CLOUD_RUN_MAX_MINUTES + 5) * 60_000;

export async function handlePhoneApi(request: Request, segments: readonly string[], deps: PhoneApiDeps): Promise<Response> {
  const method = request.method.toUpperCase();
  const [first] = segments;

  if (segments.length === 1 && method === "GET" && first === "sign-in-options") {
    return ok({ apple: deps.auth !== null && deps.appleSignIn(), google: deps.auth !== null && (await deps.googleSignIn()) });
  }

  // Sign-in steps carry their own credential.
  if (segments.length === 1 && method === "POST" && (first === "connect" || first === "token" || first === "apple" || first === "refresh")) {
    if (!deps.auth) return problem(503, "NOT_CONFIGURED", "Accounts aren't configured on this server.");
    if (first === "connect") {
      // A handful of short fields: read at most 16 KB, then parse it as the form it is.
      const raw = await readTextCapped(request, 16 * 1024);
      const form = raw === null ? null : await new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type") ?? "" }, body: raw }).formData().catch(() => null);
      const answer = await connectFromBrowser(deps.auth, {
        userId: await deps.browserUser(),
        requestOrigin: request.headers.get("origin"),
        siteOrigin: deps.siteOrigin,
        fields: { challenge: form?.get("challenge"), state: form?.get("state"), platform: form?.get("platform"), device: form?.get("device") },
      });
      if (answer.kind === "refused") return new Response(answer.message, { status: answer.status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
      const location = answer.kind === "app" ? `/auth/connect/done?${new URLSearchParams(answer.params)}` : answer.location;
      return new Response(null, { status: 303, headers: { location, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    }
    const input = await body(request);
    if (!input) return badBody();
    const clientKey = deps.clientKey(request);
    if (first === "apple") {
      if (!deps.appleSignIn()) return problem(503, "APPLE_SIGN_IN_OFF", "Sign in with Apple isn't open yet. Use Sign in with email instead.");
      const { identityToken, nonce, authorizationCode, device, appVersion } = input;
      return fromOutcome(await signInWithApple(deps.auth, { identityToken, nonce, authorizationCode, device, appVersion, clientKey }));
    }
    const grant = first === "token" ? await exchangeCode(deps.auth, { code: input.code, verifier: input.verifier, appVersion: input.appVersion, clientKey }) : await refreshPhone(deps.auth, { refreshToken: input.refreshToken, clientKey });
    return fromOutcome(grant);
  }

  const sample = first === "sample";
  const path = sample ? segments.slice(1) : segments;
  let route: Route | undefined;
  let params: Params | null = null;
  for (const r of ROUTES) {
    params = match(r, method, path);
    if (params) {
      route = r;
      break;
    }
  }
  if (!route || !params) {
    const known = ROUTES.some((r) => match(r, r.method, path) !== null);
    return known ? problem(405, "METHOD_NOT_ALLOWED", "That method isn't allowed here.") : problem(404, "NOT_FOUND", "There's nothing at this address.");
  }

  if (sample) {
    if (route.write || method !== "GET") return problem(403, "SAMPLE_READ_ONLY", SAMPLE_READ_ONLY);
    if (deps.auth && !(await deps.auth.store.rateLimit(`phone-sample:${deps.clientKey(request)}`, 60, 120))) return problem(429, "RATE_LIMITED", "Too many requests in the last minute.");
    const { ctx, runs, liveAddress } = await deps.sample();
    return route.run({ request, params, url: new URL(request.url), ctx, runs, liveAddress, caller: null, deps });
  }

  if (!deps.auth) return problem(503, "NOT_CONFIGURED", "Accounts aren't configured on this server.");
  const caller = await authenticate(deps.auth, request.headers.get("authorization"));
  if (!caller.ok) return problem(caller.status, caller.code, caller.message);
  if (route.long && caller.value.expiresAt * 1000 - deps.now().getTime() < LONG_TOKEN_MS) {
    return problem(409, "REFRESH_FIRST", "Your sign-in needs refreshing before the agent starts. The app does this by itself; try again.");
  }
  const workspace = request.headers.get("x-farbaek-workspace");
  const { ctx, runs, liveAddress } = await deps.live(caller.value, workspace && Uuid.safeParse(workspace).success ? workspace : null);
  if (workspace && ctx.current?.id !== workspace && !route.anyWorkspace) return problem(404, "NOT_FOUND", "That workspace doesn't exist or you're not a member.");
  return route.run({ request, params, url: new URL(request.url), ctx, runs, liveAddress, caller: caller.value, deps });
}
