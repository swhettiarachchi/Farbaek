/**
 * Spending AI usage from the wallet (ADR 0020), shared by every AI operation.
 *
 * Before a model call, room is reserved for its estimate: the whole prompt
 * plus the most the call can write. The database draws it from the grants
 * that expire soonest, under the organization lock, and issues this period's
 * grant on first use. After the call it settles to the real token cost
 * (src/core/billing/rate-card.ts) and gives back the rest. A call that
 * produces nothing usable is refunded in full. A settlement the database
 * couldn't be reached for is asked again, twice; one that still fails is
 * logged with its entry. Its reservation is then left open, and the hourly
 * job that closes reservations nothing settled gives it back (ADR 0279):
 * a person is never charged for a call Farbaek couldn't record.
 *
 * Units are internal only. People see the share of their usage used, when
 * it resets and what rolled over (ADR 0019), never units or costs.
 */
import { TYPICAL_PROMPT_TOKENS, isFreeWhileTesting, type ButtonOperation, type FreeOperation, type UsageOperation } from "@/config/usage";
import { costUnits, reserveUnits } from "@/core/billing/rate-card";
import type { ModelFamily } from "@/core/agent/routing";
import { resolveEffectivePlan, trialPlan, type BillingSnapshot, type EffectivePlan } from "@/core/billing/trial";
import { currentGrant, walletView, type GrantRow, type GrantSpec, type WalletView } from "@/core/billing/wallet";
import type { DraftFailure, ProviderUsage } from "@/server/ai/contract-drafter";
import type { ModelSelection } from "@/server/ai/providers";
import { log } from "@/server/observability/log";
import { MESSAGES, codeFromDatabaseError, fail, type RpcResult, type WriteDeps, type WriteErrorCode, type WriteResult } from "./use-cases";

/** The most one call may reserve or settle (the database's own bound). */
const MAX_UNITS_PER_CALL = 10_000_000;

/**
 * Why a reservation was given back. "interrupted" is written only by the hourly job that closes reservations a stopped server left
 * open (ADR 0279): no call refunds with it.
 */
export type RefundReason = "failed" | "free_retry" | "stopped" | "interrupted";

export interface AiUsageDeps {
  /** The workspace's grants that haven't expired, read as the person. */
  listUsageGrants(orgId: string): Promise<GrantRow[]>;
  reserveUsage(input: { orgId: string; actor: string; key: string; operation: UsageOperation; taskId: string | null; units: number; grant: GrantSpec | null }): Promise<RpcResult<string>>;
  settleUsage(input: {
    orgId: string;
    entryId: string;
    status: "settled" | "refunded";
    units: number;
    usage: ProviderUsage | null;
    refundReason: Exclude<RefundReason, "interrupted"> | null;
    retryCap: number | null;
  }): Promise<RpcResult<null>>;
  /** Waits between tries at a settlement; the tests don't. */
  wait?(ms: number): Promise<void>;
}

/**
 * Survey Studio's free AI (ADR 0212): a reservation on the ledger, marked free, that draws nothing from
 * the workspace and needs no plan. The platform's daily limit and a daily limit on free use still apply.
 */
export interface FreeUsageDeps {
  reserveFreeUsage(input: { orgId: string; actor: string; key: string; operation: FreeOperation; units: number }): Promise<RpcResult<string>>;
}

/** What a screen shows about an AI action, computed on the server for the current workspace. */
export interface AiAvailability {
  /** Share of this period's AI usage used, or null when it couldn't be read or is set by contract. */
  percent: number | null;
  /** When the period resets (ISO). */
  resetsAt: string;
  period: "trial" | "month";
  /** Why the button is off, or null when it works. */
  disabledReason: string | null;
  /** The model provider this server uses ("Claude", "Gemini"), or null when none is connected. */
  provider: string | null;
}

const PLAN_UNCONFIRMED = "Your plan could not be confirmed, so AI is paused. Safety controls, exports and billing still work.";

export function outOfUsage(trial: boolean, manual: string): string {
  return trial
    ? `There isn't enough AI usage left in the trial for this. Choose a plan to keep using AI, or continue without it. ${manual}`
    : `There isn't enough AI usage left this month for this. It resets at the start of the next one. ${manual}`;
}

/** The units one call costs at its real token usage. */
export function unitsFor(usage: ProviderUsage): number {
  return Math.min(MAX_UNITS_PER_CALL, costUnits(usage.model, usage));
}

/** Room for a typical call of an operation on a model, for deciding whether its button works. */
export function typicalUnits(operation: ButtonOperation, model: string, maxOutputTokens: number): number {
  return reserveUnits(model, TYPICAL_PROMPT_TOKENS[operation], maxOutputTokens);
}

export function aiAvailability(input: {
  writeReason: string | null;
  keyPresent: boolean;
  /** Provider label shown next to the action, when one is connected. */
  provider?: string | null;
  /** Why no provider is connected, when keyPresent is false. */
  notConnectedReason?: string;
  /** Null when billing state is unknown: AI then fails closed. */
  plan: EffectivePlan | null;
  /** The wallet, or null when it couldn't be read. */
  wallet: WalletView | null;
  /** The period to show when the wallet couldn't be read. */
  fallback: { resetsAt: string; period: "trial" | "month" };
  /** Room a typical call needs. */
  needs: number;
  /** What the person can still do by hand, for example "You can still write the contract yourself." */
  manual: string;
  /** Free while it's tested (ADR 0212): no plan or allowance is needed, only Farbaek's own daily limits. */
  free?: boolean;
}): AiAvailability {
  const current = input.wallet?.current ?? null;
  const base = {
    percent: current?.percent ?? null,
    resetsAt: current?.resetsAt ?? input.fallback.resetsAt,
    period: current?.period ?? input.fallback.period,
    provider: input.keyPresent ? (input.provider ?? null) : null,
  };
  if (input.writeReason) return { ...base, disabledReason: input.writeReason };
  if (!input.keyPresent) return { ...base, disabledReason: `${input.notConnectedReason ?? "AI isn't connected on this server yet."} ${input.manual}` };
  if (input.free) return { ...base, disabledReason: null };
  if (!input.plan) return { ...base, disabledReason: PLAN_UNCONFIRMED };
  if (!input.wallet) return { ...base, disabledReason: "AI usage couldn't be read, so AI is paused." };
  if (input.wallet.available < input.needs) return { ...base, disabledReason: outOfUsage(input.plan.source === "trial", input.manual) };
  return { ...base, disabledReason: null };
}

/** What the wallet needs besides the usage functions: the plan, the clock and request keys. Web writes and the agent API both provide it. */
export type UsageContext = Pick<WriteDeps, "billing" | "now" | "newEventId">;

/** Builds a model client for the model Auto routing chose, on the provider this server uses. */
export interface ModelSource<T> {
  family: ModelFamily;
  create(selection: ModelSelection): T;
}

export interface ResolvedPlan {
  snapshot: BillingSnapshot;
  plan: EffectivePlan;
}

/** The workspace's plan, or a closed failure when billing state can't be read. */
export async function resolvePlan(deps: UsageContext, orgId: string): Promise<WriteResult<ResolvedPlan>> {
  const snapshot = await deps.billing(orgId);
  if (!snapshot) return fail("ENTITLEMENT_UNAVAILABLE", PLAN_UNCONFIRMED);
  return { ok: true, value: { snapshot, plan: resolveEffectivePlan(snapshot, deps.now()) } };
}

export interface Reservation {
  entryId: string;
  units: number;
  plan: EffectivePlan;
  /** This period's grant, as issued for the reservation. */
  grant: GrantSpec | null;
}

/** Reserves room for one call. The database refuses when the grants don't hold enough. */
export async function reserveUsage(
  deps: UsageContext & AiUsageDeps,
  input: { orgId: string; userId: string; taskId: string | null; operation: UsageOperation; units: number; manual: string; billing?: ResolvedPlan },
): Promise<WriteResult<Reservation>> {
  const now = deps.now();
  const resolved = input.billing ? { ok: true as const, value: input.billing } : await resolvePlan(deps, input.orgId);
  if (!resolved.ok) return resolved;
  const { snapshot, plan } = resolved.value;
  const trial = plan.source === "trial";
  const units = Math.min(MAX_UNITS_PER_CALL, Math.max(1, Math.ceil(input.units)));
  const grant = currentGrant(plan, snapshot.trial, now, snapshot.subscriptionStartedAt ?? null);

  const reserved = await deps.reserveUsage({ orgId: input.orgId, actor: input.userId, key: deps.newEventId(), operation: input.operation, taskId: input.taskId, units, grant });
  if (!reserved.ok) {
    const code = codeFromDatabaseError(reserved.error);
    if (code === "QUOTA_EXCEEDED") return fail(trial ? "TRIAL_CAP_REACHED" : "QUOTA_EXCEEDED", outOfUsage(trial, input.manual));
    return fail(code);
  }
  return { ok: true, value: { entryId: reserved.value, units, plan, grant } };
}

/** A free call's reservation: no plan, no grant, only Farbaek's own daily limits. Settled and refunded as any other. */
export async function reserveFreeUsage(
  deps: UsageContext & FreeUsageDeps,
  input: { orgId: string; userId: string; operation: FreeOperation; units: number },
): Promise<WriteResult<{ entryId: string; units: number }>> {
  const units = Math.min(MAX_UNITS_PER_CALL, Math.max(1, Math.ceil(input.units)));
  const reserved = await deps.reserveFreeUsage({ orgId: input.orgId, actor: input.userId, key: deps.newEventId(), operation: input.operation, units });
  if (!reserved.ok) return fail(codeFromDatabaseError(reserved.error));
  return { ok: true, value: { entryId: reserved.value, units } };
}

/**
 * How one operation is paid for: free while it's tested (ADR 0212), routed as the trial so every tester
 * sees the real quality and with no plan read, or from the workspace's plan as every other operation.
 */
export type Metering = { free: true; plan: EffectivePlan } | { free: false; plan: EffectivePlan; billing: ResolvedPlan };

export async function resolveMetering(deps: UsageContext, orgId: string, operation: UsageOperation): Promise<WriteResult<Metering>> {
  if (isFreeWhileTesting(operation)) return { ok: true, value: { free: true, plan: trialPlan() } };
  const billing = await resolvePlan(deps, orgId);
  if (!billing.ok) return billing;
  return { ok: true, value: { free: false, plan: billing.value.plan, billing: billing.value } };
}

/** Reserves for one call as its metering says: a free entry, or room from the workspace's grants. */
export async function reserveMetered(
  deps: UsageContext & AiUsageDeps & FreeUsageDeps,
  metering: Metering,
  input: { orgId: string; userId: string; taskId: string | null; operation: UsageOperation; units: number; manual: string },
): Promise<WriteResult<{ entryId: string; units: number }>> {
  if (metering.free && isFreeWhileTesting(input.operation)) return reserveFreeUsage(deps, { orgId: input.orgId, userId: input.userId, operation: input.operation, units: input.units });
  if (metering.free) return fail("ENTITLEMENT_UNAVAILABLE", PLAN_UNCONFIRMED);
  const reserved = await reserveUsage(deps, { ...input, billing: metering.billing });
  return reserved.ok ? { ok: true, value: { entryId: reserved.value.entryId, units: reserved.value.units } } : reserved;
}

/** The database's own refusals of a settlement: the entry is closed already, or the request is one it won't take. Asking again answers the same. */
const SETTLE_REFUSED = /NOT_FOUND|INVALID_STATUS|RETRY_CAP/;
/** Asking again when the database couldn't be reached: a call that worked must not go unrecorded for one dropped request. */
const SETTLE_RETRY_MS = [200, 1_000] as const;

async function settling(deps: AiUsageDeps, input: Parameters<AiUsageDeps["settleUsage"]>[0]): Promise<RpcResult<null>> {
  let last: RpcResult<null> = { ok: false, error: "SETTLE_FAILED" };
  for (let i = 0; i <= SETTLE_RETRY_MS.length; i++) {
    last = await deps.settleUsage(input).catch(() => ({ ok: false as const, error: "SETTLE_FAILED" }));
    if (last.ok || SETTLE_REFUSED.test(last.error)) return last;
    if (i < SETTLE_RETRY_MS.length) await (deps.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))))(SETTLE_RETRY_MS[i]!);
  }
  // Never recorded: said in the log with the entry, so it can be found; the hourly job gives the reservation back (ADR 0279).
  log("error", "usage.settle_failed", { entry: input.entryId, status: input.status, reason: last.ok ? null : last.error.slice(0, 120) });
  return last;
}

/** Settles a call to its real cost. */
export function settleUsage(deps: AiUsageDeps, input: { orgId: string; entryId: string; usage: ProviderUsage }): Promise<RpcResult<null>> {
  return settling(deps, { ...input, status: "settled", units: unitsFor(input.usage), refundReason: null, retryCap: null });
}

/** Gives a call's whole reservation back. The real cost is still recorded, for Farbaek's own accounts. */
export function refundUsage(deps: AiUsageDeps, input: { orgId: string; entryId: string; usage: ProviderUsage | null; reason: Exclude<RefundReason, "free_retry" | "interrupted"> }): Promise<RpcResult<null>> {
  return settling(deps, { orgId: input.orgId, entryId: input.entryId, status: "refunded", units: input.usage ? unitsFor(input.usage) : 0, usage: input.usage, refundReason: input.reason, retryCap: null });
}

/**
 * A free retry (for example "Fix it" after failed checks): refunded from the
 * plan's retry hold-back while it lasts, otherwise settled normally.
 * Returns whether it was free.
 */
export async function settleAsFreeRetry(deps: AiUsageDeps, input: { orgId: string; entryId: string; usage: ProviderUsage; plan: EffectivePlan }): Promise<{ free: boolean; recorded: boolean }> {
  const units = unitsFor(input.usage);
  const cap = input.plan.limits.retryUnitsPerMonth;
  if (cap !== null && cap > 0) {
    const refunded = await settling(deps, { orgId: input.orgId, entryId: input.entryId, units, status: "refunded", usage: input.usage, refundReason: "free_retry", retryCap: cap });
    if (refunded.ok) return { free: true, recorded: true };
  }
  const settled = await settleUsage(deps, input);
  return { free: false, recorded: settled.ok };
}

/** The share of this period's usage used, read after a call, or null when it can't be read. */
export async function percentAfter(deps: UsageContext & AiUsageDeps, orgId: string, reservation: Reservation): Promise<number | null> {
  const grants = await deps.listUsageGrants(orgId).catch(() => null);
  if (!grants) return null;
  return walletView(grants, reservation.grant, deps.now()).current?.percent ?? null;
}

const FAILURE_CODE: Record<DraftFailure, WriteErrorCode> = {
  REFUSED: "AI_REFUSED",
  INCOMPLETE: "AI_INCOMPLETE",
  PROVIDER_BUSY: "AI_BUSY",
  PROVIDER_ERROR: "AI_UNAVAILABLE",
};

/** Refunds a reservation and returns the failure, saying honestly whether the refund was recorded. */
export async function refundAndFail<T>(
  deps: AiUsageDeps,
  input: { orgId: string; entryId: string; usage: ProviderUsage | null },
  failure: DraftFailure | { code: WriteErrorCode; message: string },
): Promise<WriteResult<T>> {
  const refund = await refundUsage(deps, { ...input, reason: "failed" });
  const code = typeof failure === "string" ? FAILURE_CODE[failure] : failure.code;
  const message = typeof failure === "string" ? MESSAGES[code] : failure.message;
  return fail(code, `${message} ${refund.ok ? "It didn't count toward your AI usage." : "It couldn't be taken off your AI usage automatically, so it may still count."}`);
}
