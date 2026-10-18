/**
 * Security reports in the database (migration 18). Writes go through the
 * service-role functions; pages read reports through the person's own
 * client, so Row Level Security decides what they see.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { SecurityReportStatement } from "@/core/security/report";
import type { RpcResult } from "@/server/workspace/use-cases";

export interface SecurityReportStore {
  start(input: { orgId: string; actor: string; projectId: string }): Promise<RpcResult<string>>;
  finish(
    reportId: string,
    outcome: { status: "done"; statement: SecurityReportStatement; digest: string } | { status: "failed"; error: string },
  ): Promise<RpcResult<null>>;
  interruptStale(startedBefore: Date): Promise<number>;
}

export function createSupabaseSecurityStore(admin: SupabaseClient): SecurityReportStore {
  async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<RpcResult<T>> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
  }
  return {
    start: (i) => rpc("app_start_security_report", { p_org: i.orgId, p_actor: i.actor, p_project: i.projectId }, z.string()),
    finish: (id, o) =>
      rpc(
        "app_finish_security_report",
        o.status === "done"
          ? {
              p_report: id,
              p_status: "done",
              p_score: o.statement.predicate.score,
              p_grade: o.statement.predicate.grade,
              p_counts: o.statement.predicate.counts,
              p_statement: o.statement,
              p_digest: o.digest,
              p_error: null,
            }
          : { p_report: id, p_status: "failed", p_score: null, p_grade: null, p_counts: null, p_statement: null, p_digest: null, p_error: o.error },
        z.null().or(z.literal("")).transform(() => null),
      ),
    async interruptStale(before) {
      const r = await rpc("app_interrupt_stale_security_reports", { p_started_before: before.toISOString() }, z.coerce.number().int());
      return r.ok ? r.value : 0;
    },
  };
}

const ReportRow = z.object({
  id: z.string(),
  project_id: z.string(),
  created_by: z.string(),
  status: z.enum(["running", "done", "failed"]),
  score: z.number().int().nullable(),
  grade: z.enum(["A", "B", "C", "D", "F"]).nullable(),
  statement: z.unknown().nullable(),
  digest: z.string().nullable(),
  error: z.string().nullable(),
  started_at: z.string(),
  completed_at: z.string().nullable(),
});

export interface SecurityReportView {
  id: string;
  projectId: string;
  createdBy: string;
  status: "running" | "done" | "failed";
  score: number | null;
  grade: "A" | "B" | "C" | "D" | "F" | null;
  statement: SecurityReportStatement | null;
  digest: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

const toView = (r: z.infer<typeof ReportRow>): SecurityReportView => ({
  id: r.id,
  projectId: r.project_id,
  createdBy: r.created_by,
  status: r.status,
  score: r.score,
  grade: r.grade,
  statement: (r.statement as SecurityReportStatement | null) ?? null,
  digest: r.digest,
  error: r.error,
  startedAt: r.started_at,
  completedAt: r.completed_at,
});

/** A project's reports, newest first. The newest one carries its full statement; older ones only their score. */
export async function listSecurityReports(client: SupabaseClient, orgId: string, projectId: string, limit = 10): Promise<SecurityReportView[]> {
  const { data, error } = await client
    .from("security_reports")
    .select("id, project_id, created_by, status, score, grade, statement, digest, error, started_at, completed_at")
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Couldn't load security reports: ${error.message}`);
  return z.array(ReportRow).parse(data).map(toView);
}
