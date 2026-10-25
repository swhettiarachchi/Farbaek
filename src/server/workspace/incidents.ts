/**
 * The emergency pause and incidents (ADR 0083).
 *
 * - Safety controls work on every plan: any contributor pauses agents, an
 *   owner or admin resumes them; incidents open on their own, and anyone who
 *   contributes can resolve one by saying what happened.
 * - Incident response tools are Max 2x and up: opening incidents by hand,
 *   notes, severity and status, and escalation to every owner and admin.
 * - A pause stops live cloud runs on this server and refuses new runs,
 *   desktop agents' proposals and automatic applies in the database. It
 *   can't undo what was already applied, or anything done outside Farbaek.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { checkFeature } from "@/core/billing/entitlements";
import { resolveEffectivePlan } from "@/core/billing/trial";
import { EVENT_KINDS, INCIDENT_SOURCES, INCIDENT_STATUSES, SEVERITIES, type IncidentChange, type IncidentEventKind, type IncidentSource, type IncidentStatus, type Severity } from "@/core/trust/incidents";
import { MANAGER_ROLES } from "./types";
import { codeFromDatabaseError, fail, requireContributor, type RpcResult, type WriteDeps, type WriteResult } from "./use-cases";

export const INCIDENT_TOOLS_NOT_IN_PLAN = "Incident response tools are included in Max 2x and up: opening incidents by hand, notes, severity and escalation.";
export const RESUME_MANAGERS_ONLY = "Only an owner or admin can resume agents.";
export const PAUSE_LIMITS = "A pause stops what agents would do next. It can't undo changes already applied, or anything done outside Farbaek.";

// ---------------------------------------------------------------- reading

export interface Incident {
  id: string;
  number: number;
  title: string;
  severity: Severity;
  status: IncidentStatus;
  source: IncidentSource;
  projectId: string | null;
  proposalId: string | null;
  openedAt: string;
  openedBy: string | null;
  resolvedAt: string | null;
  outcome: string | null;
  escalatedAt: string | null;
}

export interface IncidentEvent {
  id: number;
  at: string;
  actor: string | null;
  kind: IncidentEventKind;
  text: string | null;
  ref: Record<string, unknown>;
}

const INCIDENT_SELECT = "id, number, title, severity, status, source, project_id, proposal_id, opened_at, opened_by, resolved_at, outcome, escalated_at";
const IncidentRow = z.object({
  id: z.string(),
  number: z.number().int(),
  title: z.string(),
  severity: z.enum(SEVERITIES),
  status: z.enum(INCIDENT_STATUSES),
  source: z.enum(INCIDENT_SOURCES),
  project_id: z.string().nullable(),
  proposal_id: z.string().nullable(),
  opened_at: z.string(),
  opened_by: z.string().nullable(),
  resolved_at: z.string().nullable(),
  outcome: z.string().nullable(),
  escalated_at: z.string().nullable(),
});
const toIncident = (r: z.infer<typeof IncidentRow>): Incident => ({
  id: r.id,
  number: r.number,
  title: r.title,
  severity: r.severity,
  status: r.status,
  source: r.source,
  projectId: r.project_id,
  proposalId: r.proposal_id,
  openedAt: r.opened_at,
  openedBy: r.opened_by,
  resolvedAt: r.resolved_at,
  outcome: r.outcome,
  escalatedAt: r.escalated_at,
});

/** Newest first, read as the person. */
export async function listIncidents(client: SupabaseClient, orgId: string, limit = 50): Promise<Incident[]> {
  const { data, error } = await client.from("incidents").select(INCIDENT_SELECT).eq("org_id", orgId).order("number", { ascending: false }).limit(limit);
  if (error) throw new Error(`Couldn't read incidents: ${error.message}`);
  return z.array(IncidentRow).parse(data ?? []).map(toIncident);
}

const EventRow = z.object({ id: z.number().int(), at: z.string(), actor: z.string().nullable(), kind: z.enum(EVENT_KINDS), text: z.string().nullable(), ref: z.record(z.string(), z.unknown()) });

export async function readIncident(client: SupabaseClient, orgId: string, number: number): Promise<{ incident: Incident; events: IncidentEvent[] } | null> {
  const { data, error } = await client.from("incidents").select(INCIDENT_SELECT).eq("org_id", orgId).eq("number", number).maybeSingle();
  if (error) throw new Error(`Couldn't read the incident: ${error.message}`);
  if (!data) return null;
  const incident = toIncident(IncidentRow.parse(data));
  const { data: rows, error: eventError } = await client.from("incident_events").select("id, at, actor, kind, text, ref").eq("incident_id", incident.id).order("id").limit(500);
  if (eventError) throw new Error(`Couldn't read the incident's timeline: ${eventError.message}`);
  return { incident, events: z.array(EventRow).parse(rows ?? []) };
}

const ChangeRow = z.object({
  proposal_id: z.string(),
  task_id: z.string(),
  at: z.string(),
  files: z.array(z.object({ path: z.string(), kind: z.enum(["create", "edit"]) })),
  outcome: z.enum(["ALLOW", "ALLOW_WITHIN_LIMITS", "SIMULATE_FIRST", "REQUIRE_APPROVAL", "ESCALATE", "BLOCK"]),
  exact: z.boolean(),
});

/** The changes an incident is about, by shape only (migration v53). `exact` is false when they're only the ones applied just before it. */
export async function readIncidentChanges(client: SupabaseClient, orgId: string, number: number): Promise<{ changes: IncidentChange[]; exact: boolean }> {
  const { data, error } = await client.rpc("app_incident_changes", { p_org: orgId, p_number: number });
  if (error) throw new Error(`Couldn't read the incident's changes: ${error.message}`);
  const rows = z.array(ChangeRow).parse(data ?? []);
  return {
    changes: rows.map((r) => ({ proposalId: r.proposal_id, taskId: r.task_id, at: r.at, files: r.files, outcome: r.outcome })),
    exact: rows.some((r) => r.exact),
  };
}

// ---------------------------------------------------------------- use cases

export interface IncidentDeps {
  setAgentsPause(input: { orgId: string; actor: string; paused: boolean; reason: string | null }): Promise<RpcResult<boolean>>;
  /** Stops this workspace's live cloud runs on this server; returns how many. */
  stopRuns(orgId: string): number;
  openIncident(input: { orgId: string; actor: string; title: string; severity: Severity; projectId: string | null; text: string | null }): Promise<RpcResult<number>>;
  addIncidentEvent(input: { orgId: string; actor: string; number: number; kind: "note" | "prevention"; text: string; ref: Record<string, unknown> }): Promise<RpcResult<null>>;
  updateIncident(input: { orgId: string; actor: string; number: number; severity: Severity | null; status: IncidentStatus | null; outcome: string | null }): Promise<RpcResult<null>>;
}

type Deps = WriteDeps & IncidentDeps;

async function requireTools(deps: WriteDeps, orgId: string): Promise<WriteResult<null>> {
  const snapshot = await deps.billing(orgId);
  const feature = checkFeature(snapshot ? resolveEffectivePlan(snapshot, deps.now()) : null, "incident_response");
  if (!feature.allowed) return fail(feature.code, feature.code === "FEATURE_NOT_IN_PLAN" ? INCIDENT_TOOLS_NOT_IN_PLAN : feature.message);
  return { ok: true, value: null };
}

const clean = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").trim().replace(/[ \t]+/g, " ");
  return t ? t.slice(0, max) : null;
};
const done = <T>(r: RpcResult<T>): WriteResult<T> => (r.ok ? r : fail(codeFromDatabaseError(r.error)));

/** Any contributor, on every plan. Stops live runs too, even when agents were already paused. */
export async function pauseAgents(deps: Deps, input: { orgId: string; userId: string; reason: string | null }): Promise<WriteResult<{ changed: boolean; stopped: number }>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const r = await deps.setAgentsPause({ orgId: input.orgId, actor: input.userId, paused: true, reason: clean(input.reason, 300) });
  if (!r.ok) return fail(codeFromDatabaseError(r.error));
  return { ok: true, value: { changed: r.value, stopped: deps.stopRuns(input.orgId) } };
}

export async function resumeAgents(deps: Deps, input: { orgId: string; userId: string }): Promise<WriteResult<{ changed: boolean }>> {
  const role = await deps.role(input.orgId);
  if (!role) return fail("NOT_FOUND");
  if (!MANAGER_ROLES.includes(role)) return fail("FORBIDDEN", RESUME_MANAGERS_ONLY);
  const r = await deps.setAgentsPause({ orgId: input.orgId, actor: input.userId, paused: false, reason: null });
  return r.ok ? { ok: true, value: { changed: r.value } } : fail(codeFromDatabaseError(r.error));
}

export async function openIncidentByHand(
  deps: Deps,
  input: { orgId: string; userId: string; title: string; severity: string; projectId: string | null; text: string | null },
): Promise<WriteResult<{ number: number }>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const tools = await requireTools(deps, input.orgId);
  if (!tools.ok) return tools;
  const title = clean(input.title, 120);
  const severity = SEVERITIES.find((s) => s === input.severity);
  if (!title || title.length < 3 || !severity) return fail("INVALID_INCIDENT", "Give the incident a title and a severity.");
  const r = await deps.openIncident({ orgId: input.orgId, actor: input.userId, title, severity, projectId: input.projectId, text: clean(input.text, 2000) });
  return r.ok ? { ok: true, value: { number: r.value } } : fail(codeFromDatabaseError(r.error));
}

export async function addIncidentNote(deps: Deps, input: { orgId: string; userId: string; number: number; text: string }): Promise<WriteResult<null>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const tools = await requireTools(deps, input.orgId);
  if (!tools.ok) return tools;
  const text = clean(input.text, 2000);
  if (!text) return fail("INVALID_INCIDENT", "Write the note first.");
  return done(await deps.addIncidentEvent({ orgId: input.orgId, actor: input.userId, number: input.number, kind: "note", text, ref: {} }));
}

/** Severity, or marking it contained or open again: a tool. */
export async function changeIncident(deps: Deps, input: { orgId: string; userId: string; number: number; severity?: string; status?: string }): Promise<WriteResult<null>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const tools = await requireTools(deps, input.orgId);
  if (!tools.ok) return tools;
  const severity = input.severity === undefined ? null : (SEVERITIES.find((s) => s === input.severity) ?? undefined);
  const status = input.status === undefined ? null : input.status === "open" || input.status === "contained" ? input.status : undefined;
  if (severity === undefined || status === undefined) return fail("INVALID_INCIDENT");
  return done(await deps.updateIncident({ orgId: input.orgId, actor: input.userId, number: input.number, severity, status, outcome: null }));
}

/** Every plan: resolving says what happened and what was done. Final. */
export async function resolveIncident(deps: Deps, input: { orgId: string; userId: string; number: number; outcome: string }): Promise<WriteResult<null>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const outcome = clean(input.outcome, 2000);
  if (!outcome || outcome.length < 10) return fail("INVALID_INCIDENT", "Say what happened and what was done, in a sentence or two.");
  return done(await deps.updateIncident({ orgId: input.orgId, actor: input.userId, number: input.number, severity: null, status: "resolved", outcome }));
}

/** Records on the incident that rules were activated from its replay (ADR 0082). */
export async function recordPrevention(deps: WriteDeps & Pick<IncidentDeps, "addIncidentEvent">, input: { orgId: string; userId: string; number: number; rulesVersion: number }): Promise<WriteResult<null>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  return done(
    await deps.addIncidentEvent({
      orgId: input.orgId,
      actor: input.userId,
      number: input.number,
      kind: "prevention",
      text: `Workspace rules version ${input.rulesVersion} activated from this incident's replay, after testing against past changes.`,
      ref: { rulesVersion: input.rulesVersion },
    }),
  );
}
