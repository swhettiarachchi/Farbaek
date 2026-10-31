/**
 * Failure Futures Lab trials in the database (migration v82, ADR 0135).
 * Writes go through the service-role functions, which re-check the person;
 * pages read trials through the person's own client, so Row Level Security
 * decides what they see.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { FAILURE_KINDS, type FailureEvidence, type FailureKind, type IncidentMemory } from "@/core/realityloop/failure-futures";
import type { ArenaProposal } from "@/server/arena/store";
import type { RpcResult } from "@/server/workspace/use-cases";
import { readIncidentMemories } from "./incidents";

export type FailureTrialStatus = "running" | "reproduced" | "handled" | "inconclusive" | "not_testable" | "failed";

export interface FailureTrialResult {
  testPath?: string | null;
  test?: string | null;
  testSha256?: string | null;
  expects?: string | null;
  command?: string | null;
  exitCode?: number | null;
  durationMs?: number | null;
  output?: string | null;
  reason: string;
  model?: string | null;
}

export interface FailureTrialView extends Required<Omit<FailureTrialResult, "reason">> {
  id: string;
  kind: FailureKind;
  evidence: FailureEvidence[];
  status: FailureTrialStatus;
  reason: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface FailureStore {
  proposal(orgId: string, proposalId: string): Promise<ArenaProposal | null>;
  /** The project's past incidents and their files (ADR 0145); none when they can't be read. */
  incidents(orgId: string, projectId: string): Promise<IncidentMemory[]>;
  start(input: { orgId: string; actor: string; proposalId: string; kind: FailureKind; evidence: FailureEvidence[] }): Promise<RpcResult<string>>;
  attach(input: { id: string; actor: string; sessionId: string }): Promise<RpcResult<null>>;
  finish(input: { id: string; actor: string; status: Exclude<FailureTrialStatus, "running">; result: FailureTrialResult }): Promise<RpcResult<null>>;
}

const nothing = z.null().or(z.literal("")).transform(() => null);

export function createSupabaseFailureStore(admin: SupabaseClient, proposals: Pick<FailureStore, "proposal">): FailureStore {
  async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<RpcResult<T>> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
  }
  return {
    proposal: proposals.proposal,
    incidents: (orgId, projectId) => readIncidentMemories(admin, orgId, projectId).catch(() => []),
    start: (i) => rpc("app_start_failure_future", { p_org: i.orgId, p_actor: i.actor, p_proposal: i.proposalId, p_kind: i.kind, p_evidence: i.evidence }, z.string()),
    attach: (i) => rpc("app_attach_failure_session", { p_id: i.id, p_actor: i.actor, p_session: i.sessionId }, nothing),
    finish: (i) => rpc("app_finish_failure_future", { p_id: i.id, p_actor: i.actor, p_status: i.status, p_result: { ...i.result, reason: i.result.reason.slice(0, 500) } }, nothing),
  };
}

const Row = z.object({
  id: z.string(),
  kind: z.enum(FAILURE_KINDS),
  evidence: z.array(z.object({ path: z.string(), line: z.number(), snippet: z.string().catch("") })).catch([]),
  status: z.enum(["running", "reproduced", "handled", "inconclusive", "not_testable", "failed"]),
  test_path: z.string().nullable(),
  test_content: z.string().nullable(),
  test_sha256: z.string().nullable(),
  expects: z.string().nullable(),
  command: z.string().nullable(),
  exit_code: z.number().nullable(),
  duration_ms: z.number().nullable(),
  output: z.string().nullable(),
  reason: z.string().nullable(),
  model: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
});

/** A proposal's trials, newest first, read as the person. Anything malformed is left out. */
export async function readFailureTrials(client: SupabaseClient, orgId: string, proposalId: string): Promise<FailureTrialView[]> {
  const { data, error } = await client
    .from("failure_futures")
    .select("id, kind, evidence, status, test_path, test_content, test_sha256, expects, command, exit_code, duration_ms, output, reason, model, started_at, finished_at")
    .eq("org_id", orgId)
    .eq("proposal_id", proposalId)
    .order("started_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`Couldn't read the failure trials: ${error.message}`);
  return (data ?? []).flatMap((d) => {
    const r = Row.safeParse(d);
    if (!r.success) return [];
    const v = r.data;
    return [
      {
        id: v.id,
        kind: v.kind,
        evidence: v.evidence,
        status: v.status,
        testPath: v.test_path,
        test: v.test_content,
        testSha256: v.test_sha256,
        expects: v.expects,
        command: v.command,
        exitCode: v.exit_code,
        durationMs: v.duration_ms,
        output: v.output,
        reason: v.reason,
        model: v.model,
        startedAt: v.started_at,
        finishedAt: v.finished_at,
      },
    ];
  });
}
