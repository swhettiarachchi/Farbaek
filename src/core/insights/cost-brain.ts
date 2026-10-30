/**
 * Developer Cost Brain (ADR 0122, spec §10): what one task has actually used,
 * from the usage ledger and the sandbox's own records. AI usage is shown the
 * way Farbaek always shows it, as a share of this period's allowance, never
 * as internal units; tokens are shown as the providers reported them.
 * Reservations still open are estimates and are labelled so. Refunds show
 * the retry and repair cycles: failed calls, free retries and stopped runs.
 */
import { USAGE_OPERATION_LABELS, type UsageOperation } from "@/config/usage";

export interface LedgerEntry {
  operation: UsageOperation;
  status: "reserved" | "settled" | "refunded";
  refundReason: "failed" | "free_retry" | "stopped" | null;
  model: string | null;
  units: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  /** Made on the workspace's own model key (ADR 0125): its tokens count, its units are always 0. */
  ownKey?: boolean;
}

export interface SandboxUse {
  billedSeconds: number;
  state: string;
}

export interface OperationCost {
  operation: UsageOperation;
  label: string;
  /** Calls that counted: settled, or still reserved. */
  calls: number;
  /** Share of this period's allowance, or null when the allowance isn't known. */
  percent: number | null;
  /** True when part of it is a reservation not yet settled: an estimate. */
  estimated: boolean;
  /** Calls made on the workspace's own key, which don't count against the allowance. */
  ownKeyCalls: number;
  tokens: { input: number; output: number; cached: number };
  models: string[];
}

export interface TaskCost {
  operations: OperationCost[];
  /** All of it, as a share of this period's allowance. */
  percent: number | null;
  estimated: boolean;
  refunds: { failed: number; freeRetry: number; stopped: number };
  sandbox: { sessions: number; minutes: number; running: number };
}

const round = (n: number) => Math.round(n * 10) / 10;

/** `allowanceUnits` is this period's grant; null when it couldn't be read. */
export function taskCost(entries: readonly LedgerEntry[], sandboxes: readonly SandboxUse[], allowanceUnits: number | null): TaskCost {
  const share = (units: number) => (allowanceUnits && allowanceUnits > 0 ? round((units / allowanceUnits) * 100) : null);
  const byOp = new Map<UsageOperation, LedgerEntry[]>();
  for (const e of entries) byOp.set(e.operation, [...(byOp.get(e.operation) ?? []), e]);

  const operations: OperationCost[] = [...byOp].map(([operation, list]) => {
    const counted = list.filter((e) => e.status !== "refunded");
    const units = counted.reduce((n, e) => n + e.units, 0);
    return {
      operation,
      label: USAGE_OPERATION_LABELS[operation],
      calls: counted.length,
      percent: share(units),
      estimated: counted.some((e) => e.status === "reserved"),
      ownKeyCalls: counted.filter((e) => e.ownKey).length,
      tokens: {
        input: list.reduce((n, e) => n + (e.inputTokens ?? 0), 0),
        output: list.reduce((n, e) => n + (e.outputTokens ?? 0), 0),
        cached: list.reduce((n, e) => n + (e.cacheReadTokens ?? 0) + (e.cacheWriteTokens ?? 0), 0),
      },
      models: [...new Set(list.flatMap((e) => (e.model ? [e.model] : [])))].sort(),
    };
  });
  operations.sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0) || b.calls - a.calls || a.label.localeCompare(b.label));

  const counted = entries.filter((e) => e.status !== "refunded");
  const refunded = entries.filter((e) => e.status === "refunded");
  return {
    operations,
    percent: share(counted.reduce((n, e) => n + e.units, 0)),
    estimated: counted.some((e) => e.status === "reserved"),
    refunds: {
      failed: refunded.filter((e) => e.refundReason === "failed" || e.refundReason === null).length,
      freeRetry: refunded.filter((e) => e.refundReason === "free_retry").length,
      stopped: refunded.filter((e) => e.refundReason === "stopped").length,
    },
    sandbox: {
      sessions: sandboxes.length,
      minutes: Math.ceil(sandboxes.reduce((n, s) => n + s.billedSeconds, 0) / 60),
      running: sandboxes.filter((s) => ["requested", "provisioning", "ready", "paused", "stopping"].includes(s.state)).length,
    },
  };
}

/** A share for people: "less than 0.1%" rather than a misleading zero. */
export function shareLabel(percent: number | null): string {
  if (percent === null) return "not known";
  if (percent === 0) return "none";
  if (percent < 0.1) return "less than 0.1%";
  return `${percent.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}
