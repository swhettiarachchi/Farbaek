/**
 * Mutation trials in the database (migration v83, ADR 0136). Writes go
 * through the service-role functions, which re-check the person and count
 * the mutants themselves; pages read runs through the person's own client,
 * so Row Level Security decides what they see.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { MutantOutcome } from "@/core/realityloop/mutation";
import type { ArenaProposal } from "@/server/arena/store";
import type { RpcResult } from "@/server/workspace/use-cases";

export interface MutationRunView {
  id: string;
  status: "running" | "done" | "failed";
  command: string | null;
  baselineMs: number | null;
  mutants: MutantOutcome[];
  caught: number | null;
  survived: number | null;
  judged: number | null;
  computeMs: number | null;
  reason: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export type MutationResultInput =
  | { status: "done"; command: string; baselineMs: number | null; computeMs: number; mutants: MutantOutcome[] }
  | { status: "failed"; reason: string; command?: string | null; baselineMs?: number | null; computeMs?: number | null };

export interface MutationStore {
  proposal(orgId: string, proposalId: string): Promise<ArenaProposal | null>;
  start(input: { orgId: string; actor: string; proposalId: string }): Promise<RpcResult<string>>;
  attach(input: { id: string; actor: string; sessionId: string }): Promise<RpcResult<null>>;
  finish(input: { id: string; actor: string; result: MutationResultInput }): Promise<RpcResult<null>>;
}

const nothing = z.null().or(z.literal("")).transform(() => null);

export function createSupabaseMutationStore(admin: SupabaseClient, proposals: Pick<MutationStore, "proposal">): MutationStore {
  async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<RpcResult<T>> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
  }
  return {
    proposal: proposals.proposal,
    start: (i) => rpc("app_start_mutation_run", { p_org: i.orgId, p_actor: i.actor, p_proposal: i.proposalId }, z.string()),
    attach: (i) => rpc("app_attach_mutation_session", { p_id: i.id, p_actor: i.actor, p_session: i.sessionId }, nothing),
    finish: (i) => {
      const { status, ...result } = i.result;
      return rpc("app_finish_mutation_run", { p_id: i.id, p_actor: i.actor, p_status: status, p_result: "reason" in result ? { ...result, reason: result.reason.slice(0, 500) } : result }, nothing);
    },
  };
}

const MutantRow = z.object({
  id: z.string(),
  path: z.string(),
  line: z.number(),
  column: z.number(),
  operator: z.enum(["equality", "relational", "logical", "boolean", "arithmetic"]),
  original: z.string(),
  replacement: z.string(),
  before: z.string(),
  after: z.string(),
  result: z.enum(["killed", "survived", "timed_out", "not_viable", "not_run"]),
  durationMs: z.number().nullable(),
  failingTest: z.string().nullable(),
});

const Row = z.object({
  id: z.string(),
  status: z.enum(["running", "done", "failed"]),
  command: z.string().nullable(),
  baseline_ms: z.number().nullable(),
  mutants: z.array(z.unknown()).nullable(),
  caught: z.number().nullable(),
  survived: z.number().nullable(),
  judged: z.number().nullable(),
  compute_ms: z.union([z.number(), z.string()]).nullable(),
  reason: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
});

/** A proposal's latest mutation trial, read as the person. Malformed mutants are left out. */
export async function readLatestMutationRun(client: SupabaseClient, orgId: string, proposalId: string): Promise<MutationRunView | null> {
  const { data, error } = await client
    .from("mutation_runs")
    .select("id, status, command, baseline_ms, mutants, caught, survived, judged, compute_ms, reason, started_at, finished_at")
    .eq("org_id", orgId)
    .eq("proposal_id", proposalId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Couldn't read the mutation trial: ${error.message}`);
  if (!data) return null;
  const r = Row.parse(data);
  return {
    id: r.id,
    status: r.status,
    command: r.command,
    baselineMs: r.baseline_ms,
    mutants: (r.mutants ?? []).flatMap((m) => {
      const p = MutantRow.safeParse(m);
      return p.success ? [p.data] : [];
    }),
    caught: r.caught,
    survived: r.survived,
    judged: r.judged,
    computeMs: r.compute_ms === null ? null : Number(r.compute_ms),
    reason: r.reason,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  };
}
