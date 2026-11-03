/**
 * What the plan card needs beyond the task and contract: the likely share of
 * this period's AI usage a run would take, for each effort. Kept out of the
 * page so the clock is read here, not during render.
 */
import { estimateRunShare, isDesignPass, shareOfPeriod } from "@/core/agent/prompt-start";
import { capShare, capUnitsFor, type CapChoice } from "@/core/agent/run-cap";
import { EFFORTS, type Effort } from "@/core/agent/routing";
import { routeModel } from "@/server/ai/routing";
import { workspaceGrant } from "./organizations";
import { resolveAiProvider } from "@/server/ai/config";
import type { WorkspaceSummary } from "./organizations";
import type { WorkspaceReader } from "./types";

export type RunEstimates = Record<Effort, { low: number; high: number; model: string } | null>;

/** This period's allowance in units (server-side only), or null when there's none or billing is unknown. */
export function periodUnits(ws: WorkspaceSummary, now = new Date()): number | null {
  if (ws.billingUnknown) return null;
  return workspaceGrant(ws, now)?.units ?? null;
}

/** A first build or a design upgrade (ADR 0158): Free writes it with the standard model, and it's a whole site's work. */
export interface RunKind {
  designPass?: boolean;
}

/** Whether a task's run is a first build or a design upgrade, read from the project's tasks (ADR 0158). */
export async function runKindFor(reader: Pick<WorkspaceReader, "getTask" | "listTasks">, orgId: string, taskId: string): Promise<RunKind> {
  const found = await reader.getTask(orgId, taskId).catch(() => null);
  if (!found) return {};
  const tasks = await reader.listTasks(orgId, { projectId: found.task.projectId }).catch(() => null);
  return { designPass: tasks ? isDesignPass(found.task.title, tasks.length) : false };
}

export function runEstimates(ws: WorkspaceSummary, now = new Date(), kind: RunKind = {}): RunEstimates {
  const family = resolveAiProvider().provider ?? "anthropic";
  const periodUnits = ws.billingUnknown ? null : (workspaceGrant(ws, now)?.units ?? null);
  const out = {} as RunEstimates;
  for (const effort of EFFORTS) {
    const model = routeModel({ plan: ws.plan, family, step: "write", effort, designPass: kind.designPass }).model;
    const share = estimateRunShare({ model, effort, periodUnits, wholeSite: kind.designPass });
    out[effort] = share ? { ...share, model } : null;
  }
  return out;
}

/**
 * A run's cap in units for the choice made on the plan card (ADR 0040),
 * worked out here from the workspace's own plan: the browser only says
 * which choice, never how many units.
 */
export function runCapUnits(ws: WorkspaceSummary, effort: Effort, choice: CapChoice, now = new Date(), kind: RunKind = {}): number | null {
  const estimate = runEstimates(ws, now, kind)[effort];
  return estimate ? capUnitsFor(choice, estimate.high, periodUnits(ws, now)) : null;
}

export type RunUsageView = { share: string | null; refunded: number; cap: string | null; capUsed: number | null } | null;

/** What a run has used, and against its cap when it has one, as the run page shows it. */
export function runUsageView(used: { settledUnits: number; refunded: number } | null, capUnits: number | null, ws: WorkspaceSummary, now = new Date()): RunUsageView {
  if (!used) return null;
  const units = periodUnits(ws, now);
  return {
    share: shareOfPeriod(used.settledUnits, units),
    refunded: used.refunded,
    cap: capUnits ? capShare(capUnits, units) : null,
    capUsed: capUnits ? Math.min(100, Math.round((used.settledUnits / capUnits) * 100)) : null,
  };
}
