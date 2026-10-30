/**
 * Governed workflows as the person sees them (ADR 0092), read under Row
 * Level Security, with each step's newest contract.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { pathScope } from "@/core/realityloop/change-proposal";
import { IntentContractSchema } from "@/core/realityloop/contract";
import type { StepStatus, WorkflowStatus, WorkflowView } from "@/core/realityloop/workflow";

const WORKFLOW_SELECT = "id, project_id, title, status, waiting_reason, halted_reason, spend_ceiling_units, approved_by, approved_at, approved_sha256, created_at";
const Row = z.object({
  id: z.string(),
  project_id: z.string(),
  title: z.string(),
  status: z.string(),
  waiting_reason: z.enum(["checkpoint", "review"]).nullable(),
  halted_reason: z.string().nullable(),
  spend_ceiling_units: z.number(),
  approved_by: z.string().nullable(),
  approved_at: z.string().nullable(),
  approved_sha256: z.string().nullable(),
  created_at: z.string(),
});
const Step = z.object({
  workflow_id: z.string(),
  position: z.number(),
  stage: z.number(),
  title: z.string(),
  notes: z.string(),
  checkpoint: z.boolean(),
  task_id: z.string(),
  run_id: z.string().nullable(),
  status: z.string(),
  detail: z.string().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});
const Contract = z.object({ task_id: z.string(), version: z.number(), status: z.string(), sha256: z.string(), body: z.unknown() });

/** The files a contract lets its run change; none means the whole project, as when the body can't be read. */
function contractPaths(body: unknown): string[] {
  const parsed = IntentContractSchema.safeParse(body);
  return parsed.success ? pathScope(parsed.data) : [];
}

async function assemble(client: SupabaseClient, orgId: string, rows: z.infer<typeof Row>[]): Promise<WorkflowView[]> {
  if (rows.length === 0) return [];
  const { data: stepData, error } = await client
    .from("workflow_steps")
    .select("workflow_id, position, stage, title, notes, checkpoint, task_id, run_id, status, detail, started_at, finished_at")
    .eq("org_id", orgId)
    .in(
      "workflow_id",
      rows.map((r) => r.id),
    )
    .order("position");
  if (error) throw new Error(`Couldn't load workflow steps: ${error.message}`);
  const steps = z.array(Step).parse(stepData ?? []);
  const taskIds = steps.map((s) => s.task_id);
  const { data: contractData, error: cError } = taskIds.length
    ? await client.from("intent_contracts").select("task_id, version, status, sha256, body").eq("org_id", orgId).in("task_id", taskIds)
    : { data: [], error: null };
  if (cError) throw new Error(`Couldn't load workflow contracts: ${cError.message}`);
  const newest = new Map<string, z.infer<typeof Contract>>();
  for (const c of z.array(Contract).parse(contractData ?? [])) if ((newest.get(c.task_id)?.version ?? 0) < c.version) newest.set(c.task_id, c);
  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    status: r.status as WorkflowStatus,
    waitingReason: r.waiting_reason,
    haltedReason: r.halted_reason,
    ceilingUnits: r.spend_ceiling_units,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    approvedSha256: r.approved_sha256,
    createdAt: r.created_at,
    steps: steps
      .filter((s) => s.workflow_id === r.id)
      .map((s) => {
        const c = newest.get(s.task_id);
        return {
          position: s.position,
          stage: s.stage,
          title: s.title,
          notes: s.notes,
          checkpoint: s.checkpoint,
          taskId: s.task_id,
          runId: s.run_id,
          status: s.status as StepStatus,
          detail: s.detail,
          contract: c ? { status: c.status, sha256: c.sha256, version: c.version, paths: contractPaths(c.body) } : null,
          startedAt: s.started_at,
          finishedAt: s.finished_at,
        };
      }),
  }));
}

export async function readWorkflows(client: SupabaseClient, orgId: string): Promise<WorkflowView[]> {
  const { data, error } = await client.from("workflows").select(WORKFLOW_SELECT).eq("org_id", orgId).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(`Couldn't load workflows: ${error.message}`);
  return assemble(client, orgId, z.array(Row).parse(data ?? []));
}

export async function readWorkflow(client: SupabaseClient, orgId: string, id: string): Promise<WorkflowView | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await client.from("workflows").select(WORKFLOW_SELECT).eq("org_id", orgId).eq("id", id).maybeSingle();
  if (error) throw new Error(`Couldn't load the workflow: ${error.message}`);
  if (!data) return null;
  return (await assemble(client, orgId, [Row.parse(data)]))[0] ?? null;
}
