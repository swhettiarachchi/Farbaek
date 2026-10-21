/**
 * The owner's numbers for the Office Space overview (migration v22), read in
 * one call on the server. AI cost is list cost, an estimate until it's
 * reconciled with the providers' invoices; revenue isn't here at all while
 * billing is not connected.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { USD_PER_UNIT } from "@/core/billing/rate-card";

const Count = z.coerce.number().int().nonnegative();
const Series = z.array(z.coerce.number().nonnegative()).length(14);

const Metrics = z.object({
  signups: z.object({ total: Count, last7: Count, last30: Count, byDay: Series }),
  workspaces: z.object({ total: Count, new7: Count, active7: Count, suspended: Count }),
  activation: z.object({ cohort: Count, activated: Count }),
  sites: z.object({ live: Count, blocked: Count }),
  aiUnitsByDay: Series,
  runs7: z.object({ total: Count, finished: Count, failed: Count, stopped: Count }),
  trials: z.object({ started30: Count, active: Count, ended: Count, extended: Count, paid: Count }),
});

export type OfficeMetrics = z.infer<typeof Metrics> & {
  /** AI list cost per day for 14 days, in US dollars. */
  aiUsdByDay: number[];
  /** Share of the 8 to 60 day old cohort that activated, or null with no cohort yet. */
  activationRate: number | null;
};

export async function loadOfficeMetrics(admin: SupabaseClient, now = new Date()): Promise<OfficeMetrics> {
  const { data, error } = await admin.rpc("app_office_metrics", { p_now: now.toISOString() });
  if (error) throw new Error(`Office Space couldn't read the numbers: ${error.message}`);
  const m = Metrics.parse(data);
  return {
    ...m,
    aiUsdByDay: m.aiUnitsByDay.map((u) => Math.round(u * USD_PER_UNIT * 100) / 100),
    activationRate: m.activation.cohort > 0 ? Math.round((m.activation.activated / m.activation.cohort) * 100) : null,
  };
}

/** An SVG path through a series, scaled into width x height with a little headroom. */
export function sparkPath(values: readonly number[], width: number, height: number): { line: string; last: { x: number; y: number } | null } {
  if (values.length === 0) return { line: "", last: null };
  const max = Math.max(...values, 0);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const y = (v: number) => (max === 0 ? height - 1 : height - 1 - (v / max) * (height - 3));
  const points = values.map((v, i) => ({ x: Math.round(i * step * 100) / 100, y: Math.round(y(v) * 100) / 100 }));
  return { line: points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" "), last: points.at(-1) ?? null };
}
