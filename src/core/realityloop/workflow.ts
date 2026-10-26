/**
 * Governed workflows, autonomy level 4 (ADR 0092): an ordered list of steps,
 * each a normal task with its own contract a person approved, run one after
 * another by the cloud agent once an owner or admin approves the whole
 * workflow. The approval binds the exact steps, contracts and ceiling by
 * hash. The workflow stops for a person at checkpoints, when a change waits
 * for review and on any failure; it never retries on its own.
 */
import { z } from "zod";
import { canonicalHash } from "../trust/canonical-json";

export const WORKFLOW_SCHEMA = "farbaek.workflow/v1";
export const WORKFLOW_LIMITS = { minSteps: 2, maxSteps: 8, minCeilingUnits: 1_000, maxCeilingUnits: 5_000_000 } as const;

export const WorkflowDraftSchema = z.object({
  title: z.string().trim().min(3, "Give the workflow a title of at least 3 characters.").max(120),
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(3, "Each step needs a title of at least 3 characters.").max(200),
        notes: z.string().trim().max(2_000).default(""),
        checkpoint: z.boolean().default(false),
      }),
    )
    .min(WORKFLOW_LIMITS.minSteps, "A workflow has at least 2 steps.")
    .max(WORKFLOW_LIMITS.maxSteps, "A workflow has at most 8 steps."),
  ceilingUnits: z.number().int().min(WORKFLOW_LIMITS.minCeilingUnits).max(WORKFLOW_LIMITS.maxCeilingUnits),
});
export type WorkflowDraft = z.infer<typeof WorkflowDraftSchema>;

export const WORKFLOW_STATUSES = ["draft", "approved", "running", "waiting", "halted", "finished", "cancelled"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
export const STEP_STATUSES = ["pending", "running", "waiting", "verified", "failed", "cancelled"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export interface WorkflowStepView {
  position: number;
  title: string;
  notes: string;
  checkpoint: boolean;
  taskId: string;
  runId: string | null;
  status: StepStatus;
  detail: string | null;
  /** The step's newest contract: approved or not, and its hash. Null before one is drafted. */
  contract: { status: string; sha256: string; version: number } | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface WorkflowView {
  id: string;
  projectId: string;
  title: string;
  status: WorkflowStatus;
  waitingReason: "checkpoint" | "review" | null;
  haltedReason: string | null;
  ceilingUnits: number;
  approvedBy: string | null;
  approvedAt: string | null;
  approvedSha256: string | null;
  createdAt: string;
  steps: WorkflowStepView[];
}

/** The approval's binding: exactly these steps, their contracts and the ceiling. */
export function workflowHash(w: { id: string; title: string; ceilingUnits: number; steps: Pick<WorkflowStepView, "position" | "title" | "checkpoint" | "taskId" | "contract">[] }): Promise<string> {
  return canonicalHash({
    schema: WORKFLOW_SCHEMA,
    id: w.id,
    title: w.title,
    ceilingUnits: w.ceilingUnits,
    steps: [...w.steps]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ position: s.position, title: s.title, checkpoint: s.checkpoint, taskId: s.taskId, contractSha256: s.contract?.sha256 ?? null })),
  });
}

/** Steps whose contract isn't approved yet: each must be, before the workflow can be. */
export function unapprovedSteps(w: Pick<WorkflowView, "steps">): WorkflowStepView[] {
  return w.steps.filter((s) => s.contract?.status !== "approved");
}

export const WORKFLOW_WORDS: Record<WorkflowStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  running: "Running",
  waiting: "Waiting for a person",
  halted: "Stopped",
  finished: "Finished",
  cancelled: "Cancelled",
};

export const STEP_WORDS: Record<StepStatus, string> = {
  pending: "Not started",
  running: "Agent working",
  waiting: "Waiting for review",
  verified: "Verified",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** What happens next, in a sentence. */
export function nextAction(w: WorkflowView): string {
  const missing = unapprovedSteps(w).length;
  switch (w.status) {
    case "draft":
      return missing
        ? `Draft and approve the contract for ${missing === 1 ? "1 step" : `${missing} steps`}, then an owner or admin approves the workflow.`
        : "Every contract is approved. An owner or admin approves the workflow to start it.";
    case "approved":
      return "Approved. The first step starts in a moment.";
    case "running": {
      const current = w.steps.find((s) => s.status === "running");
      return current ? `The agent is working on step ${current.position}: ${current.title}.` : "Starting the next step.";
    }
    case "waiting": {
      if (w.waitingReason === "checkpoint") {
        const last = [...w.steps].reverse().find((s) => s.status === "verified");
        return `${last ? `Step ${last.position}` : "The last step"} is verified, and it's a checkpoint. Look at it, then continue.`;
      }
      const review = w.steps.find((s) => s.status === "waiting");
      return review ? `Step ${review.position}'s change is waiting for review. Apply it and run its checks, and the workflow carries on.` : "Waiting for a person.";
    }
    case "halted":
      return `Stopped: ${w.haltedReason ?? "a step failed."} Fix it on the step's task, or cancel the workflow.`;
    case "finished":
      return "Every step is verified.";
    case "cancelled":
      return "Cancelled. Finished steps stay as they are.";
  }
}
