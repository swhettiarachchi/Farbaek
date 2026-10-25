/**
 * Future-State Arena trials in the database (migration v47, ADR 0076).
 * Writes go through the service-role functions, which re-check the person;
 * pages read trials through the person's own client, so Row Level Security
 * decides what they see.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ArenaCheck } from "@/core/realityloop/arena";
import type { RpcResult } from "@/server/workspace/use-cases";

export interface ArenaProposal {
  id: string;
  taskId: string;
  projectId: string;
  status: "pending" | "blocked" | "applied" | "discarded";
  changes: { path: string; kind: "create" | "edit"; content: string }[];
}

export interface ArenaRecord {
  id: string;
  proposalId: string;
  status: "running" | "done" | "failed";
  baseline: ArenaCheck[] | null;
  candidate: ArenaCheck[] | null;
  failure: string | null;
  startedBy: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ArenaStore {
  proposal(orgId: string, proposalId: string): Promise<ArenaProposal | null>;
  start(input: { orgId: string; actor: string; proposalId: string }): Promise<RpcResult<string>>;
  attach(input: { id: string; actor: string; sessionId: string }): Promise<RpcResult<null>>;
  finish(input: { id: string; actor: string } & ({ status: "done"; baseline: ArenaCheck[]; candidate: ArenaCheck[] } | { status: "failed"; baseline: ArenaCheck[] | null; failure: string })): Promise<RpcResult<null>>;
}

const nothing = z.null().or(z.literal("")).transform(() => null);

const ProposalRow = z.object({
  id: z.string(),
  task_id: z.string(),
  project_id: z.string(),
  status: z.enum(["pending", "blocked", "applied", "discarded"]),
  changes: z.array(z.object({ path: z.string(), kind: z.enum(["create", "edit"]), content: z.string() })),
});

export function createSupabaseArenaStore(admin: SupabaseClient): ArenaStore {
  async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<RpcResult<T>> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
  }
  return {
    async proposal(orgId, proposalId) {
      if (!z.uuid().safeParse(proposalId).success) return null;
      // The server's client, scoped by workspace in the query; the start function re-checks the person.
      const { data, error } = await admin.from("change_proposals").select("id, task_id, project_id, status, changes").eq("org_id", orgId).eq("id", proposalId).maybeSingle();
      if (error) throw new Error(`Couldn't load the proposal: ${error.message}`);
      if (!data) return null;
      const r = ProposalRow.parse(data);
      return { id: r.id, taskId: r.task_id, projectId: r.project_id, status: r.status, changes: r.changes };
    },
    start: (i) => rpc("app_start_arena_run", { p_org: i.orgId, p_actor: i.actor, p_proposal: i.proposalId }, z.string()),
    attach: (i) => rpc("app_attach_arena_session", { p_id: i.id, p_actor: i.actor, p_session: i.sessionId }, nothing),
    finish: (i) =>
      rpc(
        "app_finish_arena_run",
        {
          p_id: i.id,
          p_actor: i.actor,
          p_status: i.status,
          p_baseline: i.baseline,
          p_candidate: i.status === "done" ? i.candidate : null,
          p_failure: i.status === "failed" ? i.failure.slice(0, 300) : null,
        },
        nothing,
      ),
  };
}

const Check = z.object({ name: z.string(), exitCode: z.number().int().nullable(), durationMs: z.number().nullable().optional(), failure: z.string().nullable().optional() });
const Row = z.object({
  id: z.string(),
  proposal_id: z.string(),
  status: z.enum(["running", "done", "failed"]),
  baseline: z.array(Check).nullable(),
  candidate: z.array(Check).nullable(),
  failure: z.string().nullable(),
  started_by: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
});

const toCheck = (c: z.infer<typeof Check>): ArenaCheck => ({ name: c.name, exitCode: c.exitCode, durationMs: c.durationMs ?? null, failure: c.failure ?? null });

/** The newest trial of a proposal, read as the person. */
export async function readLatestArenaRun(client: SupabaseClient, orgId: string, proposalId: string): Promise<ArenaRecord | null> {
  const { data, error } = await client
    .from("arena_runs")
    .select("id, proposal_id, status, baseline, candidate, failure, started_by, started_at, finished_at")
    .eq("org_id", orgId)
    .eq("proposal_id", proposalId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Couldn't read the trial: ${error.message}`);
  if (!data) return null;
  const r = Row.parse(data);
  return {
    id: r.id,
    proposalId: r.proposal_id,
    status: r.status,
    baseline: r.baseline?.map(toCheck) ?? null,
    candidate: r.candidate?.map(toCheck) ?? null,
    failure: r.failure,
    startedBy: r.started_by,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  };
}
