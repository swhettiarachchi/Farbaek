/**
 * Usage given back when a call was cut off (stage 272, ADR 0279). Every AI call reserves usage before the model is asked and
 * settles or refunds it when it ends; a call whose server stopped first (a restart in the middle of an answer) does neither, and its
 * reservation would stay drawn from the plan for an answer nobody got. Each hour, reservations too old to have a call behind them
 * are closed and their usage returned.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * How old an open reservation must be before it is taken for abandoned. A reservation covers one model call or one Chat turn,
 * which take minutes, and none is held across requests, so an hour is far past any of them. Nothing enforces that as a hard limit
 * on every call: one that somehow outlived the hour would find its reservation closed and its settlement refused, so it would be
 * free, never charged twice. The database refuses any age under thirty minutes.
 */
export const STALE_USAGE_MINUTES = 60;
/** Reservations closed in one run: far above an hour's restarts, and a bound on one transaction's work. */
export const STALE_USAGE_BATCH = 500;

const count = z.coerce.number().int().nonnegative();
const Row = z.object({ released: count, units: count, returned: count });

export interface StaleUsageResult {
  /** Reservations closed. */
  released: number;
  /** The units those reservations had drawn. */
  units: number;
  /** How many of those units went back to a plan period that is still running; the rest belonged to periods already over. */
  returned: number;
}

/** Closes abandoned reservations and gives their usage back. Throws when the database can't be asked, so the hourly job says it failed. */
export async function releaseStaleUsage(admin: Pick<SupabaseClient, "rpc">): Promise<StaleUsageResult> {
  const { data, error } = await admin.rpc("app_release_stale_usage", { p_minutes: STALE_USAGE_MINUTES, p_limit: STALE_USAGE_BATCH });
  if (error) throw new Error(`app_release_stale_usage: ${error.message}`);
  const row = z.array(Row).safeParse(data ?? []);
  if (!row.success || !row.data[0]) throw new Error("app_release_stale_usage: an unexpected answer");
  return row.data[0];
}
