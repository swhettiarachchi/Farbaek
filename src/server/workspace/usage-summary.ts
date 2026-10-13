import { usagePeriod, type BillingPeriod } from "@/core/billing/usage";
import { hasAnthropicKey } from "@/server/ai/config";
import type { CreditOperation } from "@/config/credits";
import { aiAvailability, type AiAvailability } from "./ai-credits";
import type { AppContext } from "./context";
import type { WorkspaceSummary } from "./organizations";
import type { Project, Task } from "./types";

export interface UsageSummary {
  period: { start: Date; end: Date; kind: "trial" | "month" };
  evaluations: number;
  /** AI credits counted in the period, or null when they couldn't be read (AI drafting then stays off). */
  aiCredits: number | null;
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
/** The window usage limits apply to: the trial while it runs, otherwise the UTC calendar month. */
export function workspacePeriod(ws: WorkspaceSummary, now: Date): BillingPeriod & { kind: "trial" | "month" } {
  const trial = ws.trial && ws.plan.source === "trial" ? { startedAt: new Date(ws.trial.startedAt), endsAt: new Date(ws.trial.endsAt) } : undefined;
  return usagePeriod(trial, null, now);
}

const MANUAL: Record<CreditOperation, string> = {
  contract_draft: "You can still write the contract yourself.",
  change_proposal: "You can still edit the files yourself.",
};

/** Whether an AI action works for this person in this workspace, and the credits left. */
export async function loadAiAvailability(ctx: AppContext, ws: WorkspaceSummary, operation: CreditOperation = "contract_draft", now = new Date()): Promise<AiAvailability> {
  const period = workspacePeriod(ws, now);
  const used = await ctx.reader.countAiCredits(ws.id, period.start, period.end).catch(() => null);
  return aiAvailability({
    operation,
    writeReason: ctx.writes.enabled ? null : ctx.writes.reason,
    keyPresent: hasAnthropicKey(),
    used,
    plan: ws.billingUnknown ? null : ws.plan,
    period: period.kind,
    manual: MANUAL[operation],
  });
}

export async function loadUsageSummary(ctx: AppContext, ws: WorkspaceSummary, now = new Date()): Promise<UsageSummary> {
  const period = workspacePeriod(ws, now);

  const [evaluations, aiCredits, projects, members, tasks] = await Promise.all([
    ctx.reader.countEvaluations(ws.id, period.start, period.end),
    ctx.reader.countAiCredits(ws.id, period.start, period.end).catch(() => null),
    ctx.reader.listProjects(ws.id),
    ctx.reader.listMembers(ws.id),
    ctx.reader.listTasks(ws.id),
  ]);
  return { period, evaluations, aiCredits, projects, members: members.length, tasks };
}
