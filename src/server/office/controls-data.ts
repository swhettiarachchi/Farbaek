/**
 * Office Space reads for the controls (ADR 0032, migration v21): one
 * workspace in full, every published site, the platform switches and the
 * announcements. The server key reads; every change goes through the
 * app_staff_* functions.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { USD_PER_UNIT } from "@/core/billing/rate-card";
import { currentGrant, walletView, type GrantRow } from "@/core/billing/wallet";
import { PLATFORM_FLAGS, type PlatformFlag } from "@/core/office/flags";
import { monthStartUtc, planLabel, trialDaysLeft } from "@/server/admin/summaries";
import { ORGANIZATION_SELECT, summarizeOrganizations } from "@/server/workspace/organizations";
import { GRANT_COLUMNS, UsageGrantRowSchema, grantFromRow } from "@/server/workspace/usage-store";

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Office Space couldn't read ${what}: ${result.error.message}`);
  return result.data as T;
}

export interface Workspace360 {
  id: string;
  name: string;
  createdAt: string;
  plan: string;
  trialDaysLeft: number | null;
  suspension: { at: string; notice: string } | null;
  members: { userId: string; email: string; role: string }[];
  projects: { id: string; name: string; archived: boolean; createdAt: string }[];
  sites: { id: string; name: string; live: boolean; blocked: { at: string; notice: string } | null }[];
  grants: (GrantRow & { kind: string })[];
  aiPercent: number | null;
  aiCostThisMonthUsd: number;
  runs: { id: string; status: string; task: string; startedAt: string }[];
}

export async function loadWorkspace360(admin: SupabaseClient, orgId: string, now = new Date()): Promise<Workspace360 | null> {
  const org = must(await admin.from("organizations").select(`${ORGANIZATION_SELECT}`).eq("id", orgId).maybeSingle(), "the workspace");
  if (!org) return null;
  const [summary] = summarizeOrganizations([org], now);
  if (!summary) return null;

  const [members, projects, sites, grants, ledger, runs] = await Promise.all([
    admin.from("organization_members").select("user_id, role").eq("org_id", orgId),
    admin.from("projects").select("id, name, archived_at, created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(50),
    admin.from("sites").select("id, name, live_deployment_id, blocked_at, blocked_notice").eq("org_id", orgId).order("created_at", { ascending: false }),
    admin.from("usage_grants").select(GRANT_COLUMNS).eq("org_id", orgId).order("expires_at", { ascending: false }).limit(50),
    admin.from("ai_credit_ledger").select("credits").eq("org_id", orgId).eq("status", "settled").gte("created_at", monthStartUtc(now).toISOString()).limit(10_000),
    admin.from("agent_runs").select("id, status, started_at, tasks(title)").eq("org_id", orgId).order("started_at", { ascending: false }).limit(10),
  ]);

  const memberRows = z.array(z.object({ user_id: z.string(), role: z.string() })).parse(must(members, "members"));
  const emails = await Promise.all(
    memberRows.map(async (m) => {
      const { data } = await admin.auth.admin.getUserById(m.user_id);
      return data.user?.email ?? "Deleted account";
    }),
  );
  const grantRows = z.array(UsageGrantRowSchema).parse(must(grants, "AI usage"));
  const own = grantRows.map(grantFromRow);
  const trial = summary.trial ? { startedAt: new Date(summary.trial.startedAt), endsAt: new Date(summary.trial.endsAt) } : undefined;
  const wallet = summary.billingUnknown ? null : walletView(own, currentGrant(summary.plan, trial, now), now);
  const units = z.array(z.object({ credits: z.coerce.number() })).parse(must(ledger, "AI cost")).reduce((sum, r) => sum + r.credits, 0);

  return {
    id: summary.id,
    name: summary.name,
    createdAt: z.object({ created_at: z.string() }).parse(org).created_at,
    plan: planLabel(summary),
    trialDaysLeft: trialDaysLeft(summary),
    suspension: summary.suspension,
    members: memberRows.map((m, i) => ({ userId: m.user_id, email: emails[i]!, role: m.role })),
    projects: z
      .array(z.object({ id: z.string(), name: z.string(), archived_at: z.string().nullable(), created_at: z.string() }))
      .parse(must(projects, "projects"))
      .map((p) => ({ id: p.id, name: p.name, archived: Boolean(p.archived_at), createdAt: p.created_at })),
    sites: z
      .array(z.object({ id: z.string(), name: z.string(), live_deployment_id: z.string().nullable(), blocked_at: z.string().nullable(), blocked_notice: z.string().nullable() }))
      .parse(must(sites, "sites"))
      .map((s) => ({ id: s.id, name: s.name, live: Boolean(s.live_deployment_id), blocked: s.blocked_at ? { at: s.blocked_at, notice: s.blocked_notice ?? "" } : null })),
    grants: own.map((g, i) => ({ ...g, kind: grantRows[i]!.kind })),
    aiPercent: wallet?.current?.percent ?? null,
    aiCostThisMonthUsd: Math.round(units * USD_PER_UNIT * 100) / 100,
    runs: z
      .array(z.object({ id: z.string(), status: z.string(), started_at: z.string(), tasks: z.union([z.object({ title: z.string() }), z.array(z.object({ title: z.string() }))]).nullable() }))
      .parse(must(runs, "agent runs"))
      .map((r) => ({ id: r.id, status: r.status, startedAt: r.started_at, task: (Array.isArray(r.tasks) ? r.tasks[0]?.title : r.tasks?.title) ?? "A task" })),
  };
}

export interface SiteRowView {
  id: string;
  name: string;
  orgId: string;
  workspace: string;
  live: boolean;
  blocked: { at: string; notice: string } | null;
  createdAt: string;
}

export async function listAllSites(admin: SupabaseClient): Promise<SiteRowView[]> {
  const rows = must(
    await admin.from("sites").select("id, name, org_id, live_deployment_id, blocked_at, blocked_notice, created_at, organizations(name)").order("created_at", { ascending: false }).limit(1000),
    "published sites",
  );
  return z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        org_id: z.string(),
        live_deployment_id: z.string().nullable(),
        blocked_at: z.string().nullable(),
        blocked_notice: z.string().nullable(),
        created_at: z.string(),
        organizations: z.union([z.object({ name: z.string() }), z.array(z.object({ name: z.string() }))]).nullable(),
      }),
    )
    .parse(rows)
    .map((s) => ({
      id: s.id,
      name: s.name,
      orgId: s.org_id,
      workspace: (Array.isArray(s.organizations) ? s.organizations[0]?.name : s.organizations?.name) ?? "Deleted workspace",
      live: Boolean(s.live_deployment_id),
      blocked: s.blocked_at ? { at: s.blocked_at, notice: s.blocked_notice ?? "" } : null,
      createdAt: s.created_at,
    }));
}

export interface FlagView {
  key: PlatformFlag;
  paused: boolean;
  message: string | null;
  updatedAt: string;
}

export async function listFlags(admin: SupabaseClient): Promise<FlagView[]> {
  const rows = z
    .array(z.object({ key: z.string(), paused: z.boolean(), public_message: z.string().nullable(), updated_at: z.string() }))
    .parse(must(await admin.from("platform_flags").select("key, paused, public_message, updated_at"), "platform switches"));
  return PLATFORM_FLAGS.map((key) => {
    const r = rows.find((x) => x.key === key);
    return { key, paused: r?.paused ?? false, message: r?.public_message ?? null, updatedAt: r?.updated_at ?? "" };
  });
}

export interface AnnouncementView {
  id: string;
  message: string;
  tone: "info" | "incident";
  dismissible: boolean;
  startsAt: string;
  endsAt: string | null;
  endedAt: string | null;
}

export async function listAnnouncements(admin: SupabaseClient): Promise<AnnouncementView[]> {
  const rows = must(await admin.from("announcements").select("id, message, tone, dismissible, starts_at, ends_at, ended_at").order("created_at", { ascending: false }).limit(30), "announcements");
  return z
    .array(z.object({ id: z.string(), message: z.string(), tone: z.enum(["info", "incident"]), dismissible: z.boolean(), starts_at: z.string(), ends_at: z.string().nullable(), ended_at: z.string().nullable() }))
    .parse(rows)
    .map((a) => ({ id: a.id, message: a.message, tone: a.tone, dismissible: a.dismissible, startsAt: a.starts_at, endsAt: a.ends_at, endedAt: a.ended_at }));
}

/** Live means not ended and inside its window. */
export function isLiveAnnouncement(a: AnnouncementView, now = new Date()): boolean {
  return !a.endedAt && Date.parse(a.startsAt) <= now.getTime() && (!a.endsAt || Date.parse(a.endsAt) > now.getTime());
}
