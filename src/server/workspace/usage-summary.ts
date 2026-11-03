import type { ButtonOperation } from "@/config/usage";
import { routeModel } from "@/server/ai/routing";
import { usagePeriod, type BillingPeriod } from "@/core/billing/usage";
import { meterState, percentUsed, type UsageMeter } from "@/core/billing/usage-view";
import { walletView, type WalletView } from "@/core/billing/wallet";
import { sandboxForPage } from "@/server/sandbox/page-context";
import { resolveAiProvider } from "@/server/ai/config";
import { LENS_MAX_OUTPUT_TOKENS } from "@/server/ai/lens-mapper";
import { POLICY_DRAFT_MAX_OUTPUT_TOKENS } from "@/server/ai/policy-drafter";
import { createChangeProposer, createContractDrafter } from "@/server/ai/providers";
import { aiAvailability, typicalUnits, type AiAvailability } from "./ai-usage";
import { MANUAL_CONTRACT } from "./ai-drafting";
import { MANUAL_LENS } from "./lens-suggestions";
import { MANUAL_SECOND_CHECK } from "./second-check";
import { MANUAL_NOTE } from "./task-notes";
import { TASK_NOTE_MAX_OUTPUT_TOKENS } from "@/server/ai/task-note-writer";
import { FAILURE_TEST_MAX_OUTPUT_TOKENS } from "@/server/ai/failure-test-writer";
import { MANUAL_FAILURE_TEST } from "@/core/realityloop/failure-futures";
import { OPENAI_SECOND_CHECK_MODEL, openAiKey } from "@/server/ai/openai-second-checker";
import { SECOND_CHECK_MAX_OUTPUT_TOKENS } from "@/server/ai/second-checker";
import type { AppContext } from "./context";
import { workspaceGrant, type WorkspaceSummary } from "./organizations";
import { MANUAL_FILES } from "./proposals";
import { MANUAL_RULES } from "./workspace-rules";
import type { Project, Task } from "./types";

export interface UsageSummary {
  period: { start: Date; end: Date; kind: "trial" | "month" };
  evaluations: number;
  /** The usage wallet, or null when it couldn't be read (AI then stays off). */
  wallet: WalletView | null;
  projects: Project[];
  members: number;
  tasks: Task[];
}

/**
 * The window evaluation limits apply to: the trial while it runs, otherwise
 * the UTC calendar month (paid plans will anchor to the subscription start
 * once payments exist). AI usage has its own periods, from its grants.
 */
export function workspacePeriod(ws: WorkspaceSummary, now: Date): BillingPeriod & { kind: "trial" | "month" } {
  const trial = ws.trial && ws.plan.source === "trial" ? { startedAt: new Date(ws.trial.startedAt), endsAt: new Date(ws.trial.endsAt) } : undefined;
  return usagePeriod(trial, null, now);
}

/** The wallet as people see it, or null when it couldn't be read. */
export async function loadWallet(ctx: AppContext, ws: WorkspaceSummary, now = new Date()): Promise<WalletView | null> {
  if (ws.billingUnknown) return null;
  const grants = await ctx.reader.listUsageGrants(ws.id).catch(() => null);
  if (!grants) return null;
  return walletView(grants, workspaceGrant(ws, now), now);
}

const MANUAL: Record<ButtonOperation, string> = {
  contract_draft: MANUAL_CONTRACT,
  change_proposal: MANUAL_FILES,
  lens_mapping: MANUAL_LENS,
  policy_draft: MANUAL_RULES,
  second_check: MANUAL_SECOND_CHECK,
  task_note: MANUAL_NOTE,
  failure_test: MANUAL_FAILURE_TEST,
};

/** Whether an AI action works for this person in this workspace, and the share of usage used. */
export async function loadAiAvailability(ctx: AppContext, ws: WorkspaceSummary, operation: ButtonOperation = "contract_draft", now = new Date()): Promise<AiAvailability> {
  const period = workspacePeriod(ws, now);
  const provider = resolveAiProvider();
  const wallet = await loadWallet(ctx, ws, now);
  // The AI mapping in the Intent Diff Lens (ADR 0044) and rule drafting (ADR 0082) run on Claude only.
  const claudeOnly = operation === "lens_mapping" || operation === "policy_draft" || operation === "task_note" || operation === "failure_test";
  // The second check (ADR 0121) runs on OpenAI when this server has its key, otherwise on Claude.
  const secondOnOpenAi = operation === "second_check" && openAiKey() !== null;
  const usable = secondOnOpenAi ? "anthropic" : (claudeOnly || operation === "second_check") && provider.provider !== "anthropic" ? null : provider.provider;
  let needs = 1;
  if (usable && !ws.billingUnknown) {
    if (operation === "second_check") {
      const model = secondOnOpenAi ? OPENAI_SECOND_CHECK_MODEL : routeModel({ plan: ws.plan, family: "anthropic", step: "review", effort: "balanced" }).model;
      needs = typicalUnits(operation, model, SECOND_CHECK_MAX_OUTPUT_TOKENS);
    } else if (operation === "lens_mapping") {
      const choice = routeModel({ plan: ws.plan, family: "anthropic", step: "review", effort: "fast" });
      needs = typicalUnits(operation, choice.model, LENS_MAX_OUTPUT_TOKENS);
    } else if (operation === "task_note") {
      const choice = routeModel({ plan: ws.plan, family: "anthropic", step: "review", effort: "balanced" });
      needs = typicalUnits(operation, choice.model, TASK_NOTE_MAX_OUTPUT_TOKENS);
    } else if (operation === "failure_test") {
      const choice = routeModel({ plan: ws.plan, family: "anthropic", step: "write", effort: "balanced" });
      needs = typicalUnits(operation, choice.model, FAILURE_TEST_MAX_OUTPUT_TOKENS);
    } else if (operation === "policy_draft") {
      const choice = routeModel({ plan: ws.plan, family: "anthropic", step: "review", effort: "balanced" });
      needs = typicalUnits(operation, choice.model, POLICY_DRAFT_MAX_OUTPUT_TOKENS);
    } else {
      // The model a Balanced run would use on this plan.
      const choice = routeModel({ plan: ws.plan, family: usable, step: operation === "contract_draft" ? "plan" : "write", effort: "balanced" });
      const model = operation === "contract_draft" ? createContractDrafter(usable, choice) : createChangeProposer(usable, choice);
      needs = typicalUnits(operation, model.model, model.maxOutputTokens);
    }
  }
  return aiAvailability({
    writeReason: ctx.writes.enabled ? null : ctx.writes.reason,
    keyPresent: usable !== null,
    provider: secondOnOpenAi ? "OpenAI" : usable && provider.provider ? provider.label : null,
    notConnectedReason: usable
      ? undefined
      : provider.provider
        ? `${operation === "policy_draft" ? "Drafting rules" : operation === "second_check" ? "The second check" : operation === "task_note" ? "Notes" : operation === "failure_test" ? "Failure trials" : "AI mapping"} isn't available with this server's AI setup.`
        : provider.reason,
    plan: ws.billingUnknown ? null : ws.plan,
    wallet,
    fallback: { resetsAt: period.end.toISOString(), period: period.kind },
    needs,
    manual: MANUAL[operation],
  });
}

export async function loadUsageSummary(ctx: AppContext, ws: WorkspaceSummary, now = new Date()): Promise<UsageSummary> {
  const period = workspacePeriod(ws, now);

  const [evaluations, wallet, projects, members, tasks] = await Promise.all([
    ctx.reader.countEvaluations(ws.id, period.start, period.end),
    loadWallet(ctx, ws, now),
    ctx.reader.listProjects(ws.id),
    ctx.reader.listMembers(ws.id),
    ctx.reader.listTasks(ws.id),
  ]);
  return { period, evaluations, wallet, projects, members: members.length, tasks };
}

const AT_LIMIT: Record<UsageMeter["id"], string> = {
  ai: "AI drafting and proposals pause until it resets. Writing contracts and editing files yourself keep working.",
  evaluations: "New governed actions pause until it resets. Exports, billing and emergency pause keep working.",
  sandbox: "New sandbox sessions can't start until it resets. Running ones finish normally.",
};

function meter(id: UsageMeter["id"], label: string, used: number, limit: number | null, period: { end: Date; kind: "trial" | "month" }): UsageMeter {
  const percent = percentUsed(used, limit);
  return { id, label, percent, state: meterState(percent), resetsAt: period.end.toISOString(), period: period.kind, atLimit: AT_LIMIT[id] };
}

/** The AI usage meter from the wallet: this period's share, plus what rolled over. */
export function aiMeter(wallet: WalletView): UsageMeter | null {
  const current = wallet.current;
  if (!current) return null;
  return {
    id: "ai",
    label: "AI usage",
    percent: current.percent,
    state: meterState(current.percent),
    resetsAt: current.resetsAt,
    period: current.period,
    atLimit: wallet.rollover ? "Carried-over usage is spent first. When both run out, AI pauses until it resets." : AT_LIMIT.ai,
    rollover: wallet.rollover ?? undefined,
  };
}

/**
 * Usage as people see it: the share of each metered limit used in its window,
 * and when that window ends. Counts stay on the server. A meter whose usage
 * can't be read is left out rather than shown as zero.
 */
export async function loadUsageMeters(ctx: AppContext, ws: WorkspaceSummary, now = new Date()): Promise<UsageMeter[]> {
  if (ws.billingUnknown) return [];
  const period = workspacePeriod(ws, now);
  const limits = ws.plan.limits;
  const [wallet, evaluations, sandbox] = await Promise.all([
    loadWallet(ctx, ws, now),
    ctx.reader.countEvaluations(ws.id, period.start, period.end).catch(() => null),
    sandboxForPage(ctx)
      .then((s) => (s.ok ? s.value.service.overview(s.value.actor) : null))
      .catch(() => null),
  ]);
  const meters: UsageMeter[] = [];
  const ai = wallet ? aiMeter(wallet) : null;
  if (ai) meters.push(ai);
  if (evaluations !== null) meters.push(meter("evaluations", "Governed evaluations", evaluations, limits.evaluationsPerMonth, period));
  if (sandbox) {
    meters.push(meter("sandbox", "Sandbox time", sandbox.minutesUsed, sandbox.limits.limits.minutesPerPeriod, { end: sandbox.limits.periodEnd, kind: sandbox.limits.periodKind }));
  }
  return meters;
}
