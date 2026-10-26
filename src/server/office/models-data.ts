/**
 * What Office Space's Models page shows (ADR 0090), read with the server
 * key: the tiers' switches, the canary runs and the latest daily check.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CanaryReport } from "@/core/ai/model-canary";
import type { ListedModel, WatchFinding } from "@/core/ai/model-watch";

export interface ModelSwitch {
  tier: string;
  model: string;
  reason: string;
  canaryId: string;
  setBy: string | null;
  setAt: string;
}

export interface CanaryRun {
  id: string;
  tier: string;
  current: string;
  candidate: string;
  status: "running" | "finished" | "failed";
  reason: string;
  estimateUnits: number;
  report: CanaryReport | null;
  reportSha256: string | null;
  failure: string | null;
  startedBy: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ModelCheck {
  checkedAt: string;
  listed: ListedModel[];
  findings: WatchFinding[];
}

const Switch = z.object({ tier: z.string(), model: z.string(), reason: z.string(), canary_id: z.string(), set_by: z.string().nullable(), set_at: z.string() });
const Run = z.object({
  id: z.string(),
  tier: z.string(),
  current_model: z.string(),
  candidate_model: z.string(),
  status: z.enum(["running", "finished", "failed"]),
  reason: z.string(),
  estimate_units: z.coerce.number(),
  report: z.unknown().nullable(),
  report_sha256: z.string().nullable(),
  failure: z.string().nullable(),
  started_by: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
});
const Check = z.object({
  checked_at: z.string(),
  listed: z.array(z.object({ id: z.string(), name: z.string(), created_at: z.string() })),
  findings: z.array(z.unknown()),
});

export async function readModelsPage(admin: SupabaseClient): Promise<{ switches: ModelSwitch[]; runs: CanaryRun[]; check: ModelCheck | null }> {
  const [switches, runs, check] = await Promise.all([
    admin.from("platform_models").select("tier, model, reason, canary_id, set_by, set_at").eq("family", "anthropic"),
    admin
      .from("model_canary_runs")
      .select("id, tier, current_model, candidate_model, status, reason, estimate_units, report, report_sha256, failure, started_by, started_at, finished_at")
      .order("started_at", { ascending: false })
      .limit(10),
    admin.from("model_checks").select("checked_at, listed, findings").order("checked_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const r of [switches, runs, check]) if (r.error) throw new Error(`Couldn't load the models page: ${r.error.message}`);
  const c = check.data ? Check.parse(check.data) : null;
  return {
    switches: z
      .array(Switch)
      .parse(switches.data ?? [])
      .map((s) => ({ tier: s.tier, model: s.model, reason: s.reason, canaryId: s.canary_id, setBy: s.set_by, setAt: s.set_at })),
    runs: z
      .array(Run)
      .parse(runs.data ?? [])
      .map((r) => ({
        id: r.id,
        tier: r.tier,
        current: r.current_model,
        candidate: r.candidate_model,
        status: r.status,
        reason: r.reason,
        estimateUnits: r.estimate_units,
        report: (r.report as CanaryReport | null) ?? null,
        reportSha256: r.report_sha256,
        failure: r.failure,
        startedBy: r.started_by,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
      })),
    check: c ? { checkedAt: c.checked_at, listed: c.listed.map((m) => ({ id: m.id, displayName: m.name, createdAt: m.created_at })), findings: c.findings as WatchFinding[] } : null,
  };
}
