/**
 * Verification attempts in the database (migration 32, ADR 0047). Writes go
 * through the service-role functions, which re-check the person; pages read
 * attempts through the person's own client, so Row Level Security decides
 * what they see.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { VerificationRecord, VerificationTrigger } from "@/core/realityloop/verification";
import type { RpcResult } from "@/server/workspace/use-cases";

export interface VerificationStore {
  start(input: { orgId: string; actor: string; taskId: string; trigger: VerificationTrigger }): Promise<RpcResult<string>>;
  attach(input: { id: string; actor: string; sessionId: string }): Promise<RpcResult<null>>;
  finish(input: { id: string; actor: string } & ({ status: "done"; receiptDigest: string } | { status: "failed"; failure: string })): Promise<RpcResult<null>>;
}

const nothing = z.null().or(z.literal("")).transform(() => null);

export function createSupabaseVerificationStore(admin: SupabaseClient): VerificationStore {
  async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<RpcResult<T>> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
  }
  return {
    start: (i) => rpc("app_start_task_verification", { p_org: i.orgId, p_actor: i.actor, p_task: i.taskId, p_trigger: i.trigger }, z.string()),
    attach: (i) => rpc("app_attach_verification_session", { p_id: i.id, p_actor: i.actor, p_session: i.sessionId }, nothing),
    finish: (i) =>
      rpc(
        "app_finish_task_verification",
        { p_id: i.id, p_actor: i.actor, p_status: i.status, p_receipt: i.status === "done" ? i.receiptDigest : null, p_failure: i.status === "failed" ? i.failure : null },
        nothing,
      ),
  };
}

export const VerificationRow = z.object({
  id: z.string(),
  task_id: z.string(),
  trigger: z.enum(["person", "autonomy"]),
  status: z.enum(["running", "done", "failed"]),
  result: z.enum(["verified", "partially_verified", "failed", "unverified"]).nullable(),
  receipt_digest: z.string().nullable(),
  failure: z.string().nullable(),
  session_id: z.string().nullable(),
  started_by: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
});

export const VERIFICATION_SELECT = "id, task_id, trigger, status, result, receipt_digest, failure, session_id, started_by, started_at, finished_at";

export function verificationFromRow(row: z.infer<typeof VerificationRow>): VerificationRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    trigger: row.trigger,
    status: row.status,
    result: row.result,
    receiptDigest: row.receipt_digest,
    failure: row.failure,
    sessionId: row.session_id,
    startedBy: row.started_by,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}
