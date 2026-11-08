"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { abortCloudRuns } from "@/server/cloud-agent/executor";
import { log } from "@/server/observability/log";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext, type AppContext } from "@/server/workspace/context";
import { addIncidentNote, changeIncident, openIncidentByHand, pauseAgents, resolveIncident, resumeAgents, type IncidentDeps } from "@/server/workspace/incidents";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import type { RpcResult } from "@/server/workspace/use-cases";

export type IncidentActionState = { status: "idle" } | { status: "done"; message: string; number?: number } | { status: "error"; message: string };

/**
 * The writer's deps plus the incident functions. A pause is checked against
 * `ctx.writes` like any write except a staff suspension: stopping agents must
 * work whenever a person can reach this page.
 */
async function incidentDeps(ctx: AppContext) {
  if (!ctx.current) return { error: "Create a workspace first." } as const;
  if (ctx.mode !== "live") return { error: "The demo workspace is read-only." } as const;
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { error: "Farbaek's server isn't set up to save changes yet. Write to support@farbaek.com." } as const;
  async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<RpcResult<T>> {
    const { data, error } = await admin!.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
  }
  const incidents: IncidentDeps = {
    setAgentsPause: (i) => rpc("app_set_agents_pause", { p_org: i.orgId, p_actor: i.actor, p_paused: i.paused, p_reason: i.reason }, z.boolean()),
    stopRuns: (orgId) => abortCloudRuns({ orgId }),
    openIncident: (i) =>
      rpc("app_open_incident", { p_org: i.orgId, p_actor: i.actor, p_title: i.title, p_severity: i.severity, p_project: i.projectId, p_text: i.text }, z.number().int()),
    addIncidentEvent: (i) =>
      rpc("app_add_incident_event", { p_org: i.orgId, p_actor: i.actor, p_number: i.number, p_kind: i.kind, p_text: i.text, p_ref: i.ref }, z.unknown()).then((r) =>
        r.ok ? { ok: true as const, value: null } : r,
      ),
    updateIncident: (i) =>
      rpc("app_update_incident", { p_org: i.orgId, p_actor: i.actor, p_number: i.number, p_severity: i.severity, p_status: i.status, p_outcome: i.outcome }, z.unknown()).then(
        (r) => (r.ok ? { ok: true as const, value: null } : r),
      ),
  };
  return { deps: { ...createSupabaseWriteDeps(user, admin, ctx.user.id), ...incidents }, orgId: ctx.current.id } as const;
}

const NUMBER = z.number().int().min(1).max(1_000_000);

type Ready = { deps: Parameters<typeof pauseAgents>[0]; orgId: string; ctx: AppContext };

async function withDeps(run: (w: Ready) => Promise<IncidentActionState>): Promise<IncidentActionState> {
  const ctx = await loadAppContext();
  if (!ctx) return { status: "error", message: "Sign in again." };
  const w = await incidentDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error ?? "This can't run here." };
  return run({ deps: w.deps, orgId: w.orgId, ctx });
}

/** Stops the workspace's agents: any contributor, every plan (ADR 0083). */
export async function pauseAgentsAction(input: { reason: string }): Promise<IncidentActionState> {
  const reason = z.string().max(1_000).safeParse(input?.reason ?? "");
  return withDeps(async ({ deps, orgId, ctx }) => {
    const r = await pauseAgents(deps, { orgId, userId: ctx.user.id, reason: reason.success ? reason.data : null });
    if (!r.ok) return { status: "error", message: r.message };
    log("info", "agents.paused", { stopped: r.value.stopped });
    revalidatePath("/app", "layout");
    return {
      status: "done",
      message: r.value.changed
        ? `Agents are paused.${r.value.stopped ? ` ${r.value.stopped === 1 ? "One live run was" : `${r.value.stopped} live runs were`} stopped.` : ""}`
        : `Agents were already paused.${r.value.stopped ? " Live runs were stopped again." : ""}`,
    };
  });
}

export async function resumeAgentsAction(): Promise<IncidentActionState> {
  return withDeps(async ({ deps, orgId, ctx }) => {
    const r = await resumeAgents(deps, { orgId, userId: ctx.user.id });
    if (!r.ok) return { status: "error", message: r.message };
    revalidatePath("/app", "layout");
    return { status: "done", message: r.value.changed ? "Agents are running again." : "Agents weren't paused." };
  });
}

export async function openIncidentAction(input: { title: string; severity: string; projectId: string; text: string }): Promise<IncidentActionState> {
  const parsed = z.object({ title: z.string().max(500), severity: z.string().max(20), projectId: z.string().max(80), text: z.string().max(5_000) }).safeParse(input);
  if (!parsed.success) return { status: "error", message: "Give the incident a title and a severity." };
  const projectId = z.uuid().safeParse(parsed.data.projectId).success ? parsed.data.projectId : null;
  return withDeps(async ({ deps, orgId, ctx }) => {
    const r = await openIncidentByHand(deps, { orgId, userId: ctx.user.id, title: parsed.data.title, severity: parsed.data.severity, projectId, text: parsed.data.text });
    if (!r.ok) return { status: "error", message: r.message };
    revalidatePath("/app/incidents");
    return { status: "done", message: `Incident #${r.value.number} is open.`, number: r.value.number };
  });
}

export async function addIncidentNoteAction(input: { number: number; text: string }): Promise<IncidentActionState> {
  const parsed = z.object({ number: NUMBER, text: z.string().max(5_000) }).safeParse(input);
  if (!parsed.success) return { status: "error", message: "Write the note first." };
  return withDeps(async ({ deps, orgId, ctx }) => {
    const r = await addIncidentNote(deps, { orgId, userId: ctx.user.id, number: parsed.data.number, text: parsed.data.text });
    if (!r.ok) return { status: "error", message: r.message };
    revalidatePath(`/app/incidents/${parsed.data.number}`);
    return { status: "done", message: "Note added." };
  });
}

export async function changeIncidentAction(input: { number: number; severity?: string; status?: string }): Promise<IncidentActionState> {
  const parsed = z.object({ number: NUMBER, severity: z.string().max(20).optional(), status: z.string().max(20).optional() }).safeParse(input);
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  return withDeps(async ({ deps, orgId, ctx }) => {
    const r = await changeIncident(deps, { orgId, userId: ctx.user.id, ...parsed.data });
    if (!r.ok) return { status: "error", message: r.message };
    revalidatePath(`/app/incidents/${parsed.data.number}`);
    return { status: "done", message: parsed.data.status === "contained" ? "Marked as contained." : parsed.data.status === "open" ? "Marked as open again." : "Severity changed." };
  });
}

export async function resolveIncidentAction(input: { number: number; outcome: string }): Promise<IncidentActionState> {
  const parsed = z.object({ number: NUMBER, outcome: z.string().max(5_000) }).safeParse(input);
  if (!parsed.success) return { status: "error", message: "Say what happened and what was done." };
  return withDeps(async ({ deps, orgId, ctx }) => {
    const r = await resolveIncident(deps, { orgId, userId: ctx.user.id, number: parsed.data.number, outcome: parsed.data.outcome });
    if (!r.ok) return { status: "error", message: r.message };
    revalidatePath(`/app/incidents/${parsed.data.number}`);
    revalidatePath("/app/incidents");
    return { status: "done", message: "Resolved." };
  });
}
