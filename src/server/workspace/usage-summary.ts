import { TRIAL } from "@/core/billing/catalog";
import { billingPeriod } from "@/core/billing/usage";
import type { AppContext } from "./context";
import type { WorkspaceSummary } from "./organizations";
import type { Project, Task } from "./types";

export interface UsageSummary {
  period: { start: Date; end: Date; kind: "trial" | "month" };
  evaluations: number;
  projects: Project[];
  members: number;
  tasks: Task[];
}

/**
 * The numbers Mission Control and Billing show, from real records.
 * During a trial the evaluation cap covers the whole trial, so the period is
 * the trial window. Otherwise the UTC calendar month (the Free plan rule;
 * paid plans will anchor to the subscription start once payments exist).
 */
export async function loadUsageSummary(ctx: AppContext, ws: WorkspaceSummary, now = new Date()): Promise<UsageSummary> {
  const trialActive = ws.trial?.phase.phase === "active";
  const period = trialActive
    ? { start: new Date(new Date(ws.trial!.endsAt).getTime() - TRIAL.lengthDays * 86_400_000), end: new Date(ws.trial!.endsAt), kind: "trial" as const }
    : { ...billingPeriod(null, now), kind: "month" as const };

  const [evaluations, projects, members, tasks] = await Promise.all([
    ctx.reader.countEvaluations(ws.id, period.start, period.end),
    ctx.reader.listProjects(ws.id),
    ctx.reader.listMembers(ws.id),
    ctx.reader.listTasks(ws.id),
  ]);
  return { period, evaluations, projects, members: members.length, tasks };
}
