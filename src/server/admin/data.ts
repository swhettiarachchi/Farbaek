/**
 * What the admin console reads (ADR 0026). Every function takes the
 * server-key client that requireAdmin hands out after its check, so none of
 * them can run for anyone else. Read-only: nothing here writes.
 *
 * Sized for today's scale: lists are capped and say so when the cap is hit.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { currentGrant, walletView } from "@/core/billing/wallet";
import { resolveAiProvider } from "@/server/ai/config";
import { sandboxExecutionMode } from "@/server/sandbox/registry";
import { hasServerWriteKey } from "@/server/supabase/admin";
import { ORGANIZATION_SELECT, summarizeOrganizations, type WorkspaceSummary } from "@/server/workspace/organizations";
import { GRANT_COLUMNS, UsageGrantRowSchema, grantFromRow } from "@/server/workspace/usage-store";
import { aiCostUsd, countBy, latestBy, monthStartUtc, planLabel, trialDaysLeft } from "./summaries";

const LIST_CAP = 1000;
const ACTIVITY_LIMIT = 25;
const DAY = 86_400_000;

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Admin console couldn't read ${what}: ${result.error.message}`);
  return result.data as T;
}

async function count(admin: SupabaseClient, table: string, where: { isNull?: string; since?: { column: string; at: string } } = {}): Promise<number> {
  let q = admin.from(table).select("*", { count: "exact", head: true });
  if (where.isNull) q = q.is(where.isNull, null);
  if (where.since) q = q.gte(where.since.column, where.since.at);
  const { count: n, error } = await q;
  if (error) throw new Error(`Admin console couldn't count ${table}: ${error.message}`);
  return n ?? 0;
}

export interface AdminPerson {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  confirmed: boolean;
}

/** Everyone with an account, newest first. */
export async function listPeople(admin: SupabaseClient): Promise<{ people: AdminPerson[]; capped: boolean }> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: LIST_CAP });
  if (error) throw new Error(`Admin console couldn't read people: ${error.message}`);
  const people = data.users
    .map((u) => ({ id: u.id, email: u.email ?? "(no email)", createdAt: u.created_at, lastSignInAt: u.last_sign_in_at ?? null, confirmed: Boolean(u.email_confirmed_at) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { people, capped: data.users.length >= LIST_CAP };
}

async function workspaces(admin: SupabaseClient, now: Date): Promise<WorkspaceSummary[]> {
  const rows = must(await admin.from("organizations").select(ORGANIZATION_SELECT).order("created_at", { ascending: false }).limit(LIST_CAP), "workspaces");
  return summarizeOrganizations(rows, now);
}

export interface AdminOverview {
  people: { total: number; newThisWeek: number; capped: boolean };
  workspaces: { total: number; onTrial: number; trialsEndingSoon: number; paid: number };
  projects: number;
  tasks: number;
  runs: { lastWeek: number; finished: number };
  securityChecksLastWeek: number;
  aiCost: { usd: number; since: string; settledCalls: number };
}

export async function loadOverview(admin: SupabaseClient, now = new Date()): Promise<AdminOverview> {
  const weekAgo = new Date(now.getTime() - 7 * DAY).toISOString();
  const monthStart = monthStartUtc(now);
  const [people, ws, projects, tasks, runs, checks, ledger] = await Promise.all([
    listPeople(admin),
    workspaces(admin, now),
    count(admin, "projects", { isNull: "archived_at" }),
    count(admin, "tasks"),
    admin.from("agent_runs").select("status").gte("started_at", weekAgo).limit(LIST_CAP),
    count(admin, "security_reports", { since: { column: "started_at", at: weekAgo } }),
    admin.from("ai_credit_ledger").select("credits").eq("status", "settled").gte("created_at", monthStart.toISOString()).limit(10_000),
  ]);
  const runRows = z.array(z.object({ status: z.string() })).parse(must(runs, "agent runs"));
  const ledgerRows = z.array(z.object({ credits: z.coerce.number() })).parse(must(ledger, "AI usage"));
  return {
    people: { total: people.people.length, newThisWeek: people.people.filter((p) => p.createdAt >= weekAgo).length, capped: people.capped },
    workspaces: {
      total: ws.length,
      onTrial: ws.filter((w) => trialDaysLeft(w) !== null).length,
      trialsEndingSoon: ws.filter((w) => {
        const left = trialDaysLeft(w);
        return left !== null && left <= 3;
      }).length,
      paid: ws.filter((w) => w.plan.source === "paid").length,
    },
    projects,
    tasks,
    runs: { lastWeek: runRows.length, finished: runRows.filter((r) => r.status === "finished").length },
    securityChecksLastWeek: checks,
    aiCost: { usd: aiCostUsd(ledgerRows), since: monthStart.toISOString(), settledCalls: ledgerRows.length },
  };
}

export interface AdminWorkspaceRow {
  id: string;
  name: string;
  createdAt: string;
  plan: string;
  trialDaysLeft: number | null;
  members: number;
  projects: number;
  /** Share of this period's AI usage used, or null when there's no grant this period. */
  aiPercent: number | null;
  lastActivity: string | null;
}

export async function loadWorkspaces(admin: SupabaseClient, now = new Date()): Promise<AdminWorkspaceRow[]> {
  const [ws, orgRows, members, projects, grants, tasks] = await Promise.all([
    workspaces(admin, now),
    admin.from("organizations").select("id, created_at").limit(LIST_CAP),
    admin.from("organization_members").select("org_id").limit(10_000),
    admin.from("projects").select("org_id").is("archived_at", null).limit(10_000),
    admin.from("usage_grants").select(`org_id, ${GRANT_COLUMNS}`).gt("expires_at", now.toISOString()).limit(10_000),
    admin.from("tasks").select("org_id, updated_at").order("updated_at", { ascending: false }).limit(5_000),
  ]);
  const OrgRef = z.object({ org_id: z.string() });
  const created = new Map(z.array(z.object({ id: z.string(), created_at: z.string() })).parse(must(orgRows, "workspaces")).map((o) => [o.id, o.created_at]));
  const memberCounts = countBy(z.array(OrgRef).parse(must(members, "members")), (r) => r.org_id);
  const projectCounts = countBy(z.array(OrgRef).parse(must(projects, "projects")), (r) => r.org_id);
  const lastTask = latestBy(z.array(OrgRef.extend({ updated_at: z.string() })).parse(must(tasks, "tasks")), (r) => r.org_id, (r) => r.updated_at);
  const grantRows = z.array(UsageGrantRowSchema.extend({ org_id: z.string() })).parse(must(grants, "AI usage"));

  return ws.map((w) => {
    const trial = w.trial ? { startedAt: new Date(w.trial.startedAt), endsAt: new Date(w.trial.endsAt) } : undefined;
    const own = grantRows.filter((g) => g.org_id === w.id).map(grantFromRow);
    const wallet = w.billingUnknown ? null : walletView(own, currentGrant(w.plan, trial, now), now);
    return {
      id: w.id,
      name: w.name,
      createdAt: created.get(w.id) ?? "",
      plan: planLabel(w),
      trialDaysLeft: trialDaysLeft(w),
      members: memberCounts.get(w.id) ?? 0,
      projects: projectCounts.get(w.id) ?? 0,
      aiPercent: wallet?.current?.percent ?? null,
      lastActivity: lastTask.get(w.id) ?? null,
    };
  });
}

/** Workspaces per person, for the People page. */
export async function workspaceCountsByPerson(admin: SupabaseClient): Promise<Map<string, number>> {
  const rows = z.array(z.object({ user_id: z.string() })).parse(must(await admin.from("organization_members").select("user_id").limit(10_000), "members"));
  return countBy(rows, (r) => r.user_id);
}

const one = <T extends z.ZodType>(schema: T) => z.union([schema, z.array(schema)]).nullable().transform((v) => (Array.isArray(v) ? (v[0] ?? null) : v));

export interface AdminActivity {
  runs: { id: string; workspace: string; task: string; status: string; model: string | null; steps: number; tokens: number; startedAt: string }[];
  checks: { id: string; workspace: string; project: string; status: string; score: number | null; grade: string | null; startedAt: string }[];
  audit: { id: string; workspace: string; action: string; target: string; actorId: string | null; at: string }[];
}

export async function loadActivity(admin: SupabaseClient): Promise<AdminActivity> {
  const [runs, checks, audit] = await Promise.all([
    admin
      .from("agent_runs")
      .select("id, status, model, steps, input_tokens, output_tokens, started_at, tasks(title), organizations(name)")
      .order("started_at", { ascending: false })
      .limit(ACTIVITY_LIMIT),
    admin.from("security_reports").select("id, status, score, grade, started_at, projects(name), organizations(name)").order("started_at", { ascending: false }).limit(ACTIVITY_LIMIT),
    admin.from("audit_events").select("id, action, target, actor_id, occurred_at, organizations(name)").order("occurred_at", { ascending: false }).limit(ACTIVITY_LIMIT),
  ]);
  const Name = one(z.object({ name: z.string() }));
  return {
    runs: z
      .array(
        z.object({
          id: z.string(),
          status: z.string(),
          model: z.string().nullable(),
          steps: z.coerce.number(),
          input_tokens: z.coerce.number(),
          output_tokens: z.coerce.number(),
          started_at: z.string(),
          tasks: one(z.object({ title: z.string() })),
          organizations: Name,
        }),
      )
      .parse(must(runs, "agent runs"))
      .map((r) => ({
        id: r.id,
        workspace: r.organizations?.name ?? "Workspace",
        task: r.tasks?.title ?? "Task",
        status: r.status,
        model: r.model,
        steps: r.steps,
        tokens: r.input_tokens + r.output_tokens,
        startedAt: r.started_at,
      })),
    checks: z
      .array(
        z.object({
          id: z.string(),
          status: z.string(),
          score: z.coerce.number().nullable(),
          grade: z.string().nullable(),
          started_at: z.string(),
          projects: Name,
          organizations: Name,
        }),
      )
      .parse(must(checks, "security checks"))
      .map((c) => ({ id: c.id, workspace: c.organizations?.name ?? "Workspace", project: c.projects?.name ?? "Project", status: c.status, score: c.score, grade: c.grade, startedAt: c.started_at })),
    audit: z
      .array(z.object({ id: z.coerce.string(), action: z.string(), target: z.string().nullable(), actor_id: z.string().nullable(), occurred_at: z.string(), organizations: Name }))
      .parse(must(audit, "audit events"))
      .map((a) => ({ id: a.id, workspace: a.organizations?.name ?? "Platform", action: a.action, target: a.target ?? "", actorId: a.actor_id, at: a.occurred_at })),
  };
}

export interface Connection {
  name: string;
  on: boolean;
  detail: string;
}

/** What this deployment has connected. Names and states only, never a value. */
export function deploymentConnections(env: Record<string, string | undefined> = process.env): Connection[] {
  const ai = resolveAiProvider();
  const sandbox = sandboxExecutionMode();
  const billing = (env.BILLING_MODE ?? "").trim() || "not_connected";
  return [
    { name: "Database writes", on: hasServerWriteKey(), detail: hasServerWriteKey() ? "Server key set" : "SUPABASE_SECRET_KEY isn't set" },
    { name: "AI", on: ai.provider !== null, detail: ai.provider ? ai.label : ai.reason },
    { name: "Sandbox", on: sandbox.mode === "sandboxed", detail: sandbox.mode === "sandboxed" ? "Code runs in isolated sandboxes" : sandbox.reason },
    {
      name: "Previews",
      on: Boolean(env.SANDBOX_PREVIEW_DOMAIN && env.SANDBOX_PREVIEW_SECRET),
      detail: env.SANDBOX_PREVIEW_DOMAIN && env.SANDBOX_PREVIEW_SECRET ? "Preview host and secret set" : "Needs SANDBOX_PREVIEW_DOMAIN and SANDBOX_PREVIEW_SECRET",
    },
    { name: "Payments", on: billing !== "not_connected", detail: billing === "not_connected" ? "Not connected until go-live" : `BILLING_MODE is ${billing.slice(0, 30)}` },
    { name: "Trial emails", on: Boolean(env.EMAIL_PROVIDER_API_KEY), detail: env.EMAIL_PROVIDER_API_KEY ? "Provider key set" : "No email provider yet" },
  ];
}

/** Which build this is: the Railway commit when deployed there, otherwise local. */
export function deploymentLabel(env: Record<string, string | undefined> = process.env): string {
  const sha = env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7);
  const where = env.RAILWAY_ENVIRONMENT_NAME ? `Railway ${env.RAILWAY_ENVIRONMENT_NAME.slice(0, 30)}` : "Local";
  return sha ? `${where} · ${sha}` : where;
}
