/**
 * Office Space's health page (migration v23): the platform's state read in
 * one call, plus what this server knows about itself. Each check says OK,
 * Attention or Unknown in words; nothing here is estimated or invented.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { FLAG_DETAILS, isPlatformFlag } from "@/core/office/flags";
import { waitingFor } from "@/core/support/support";
import { deploymentInfo } from "@/server/deployment";

const Count = z.coerce.number().int().nonnegative();
const Snapshot = z.object({
  runs: z.object({ live: Count, stuck: Count, failed24: Count, finished24: Count }),
  audit: z.object({ events: Count.nullable(), lastCheck: z.object({ at: z.string(), ok: z.boolean(), through: Count }).nullable() }),
  paused: z.array(z.string()),
  support: z.object({ waiting: Count, oldestWaitingAt: z.string().nullable() }),
});
export type HealthSnapshot = z.infer<typeof Snapshot>;

export type CheckState = "ok" | "attention" | "unknown";
export interface HealthCheck {
  key: string;
  label: string;
  state: CheckState;
  value: string;
  detail: string;
  href?: string;
}

/** A database round trip slower than this needs a look. */
export const SLOW_DATABASE_MS = 800;
/** The audit chain should be checked at least this often. */
export const AUDIT_CHECK_DAYS = 7;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The checks, from a snapshot and the round trip. Pure, so each verdict is tested. */
export function healthChecks(s: HealthSnapshot, dbMs: number, now: Date): HealthCheck[] {
  const ended24 = s.runs.failed24 + s.runs.finished24;
  const failureShare = ended24 > 0 ? s.runs.failed24 / ended24 : 0;
  const lastCheck = s.audit.lastCheck;
  const checkAgeDays = lastCheck ? (now.getTime() - Date.parse(lastCheck.at)) / 86_400_000 : null;
  const oldestHours = s.support.oldestWaitingAt ? (now.getTime() - Date.parse(s.support.oldestWaitingAt)) / 3_600_000 : 0;

  return [
    {
      key: "database",
      label: "Database",
      state: dbMs < SLOW_DATABASE_MS ? "ok" : "attention",
      value: `${Math.round(dbMs)} ms`,
      detail: dbMs < SLOW_DATABASE_MS ? "One round trip from this server, just now." : `Slower than ${SLOW_DATABASE_MS} ms for one round trip. Check Supabase's status and this server's region.`,
    },
    {
      key: "runs",
      label: "Agent runs",
      state: s.runs.stuck > 0 ? "attention" : "ok",
      value: `${s.runs.live} live`,
      detail:
        s.runs.stuck > 0
          ? `${plural(s.runs.stuck, "run")} haven't reported in 10 minutes, usually because a server restarted. Each is marked interrupted when someone next opens it.`
          : "Every live run reported in the last 10 minutes.",
      href: "/activity",
    },
    {
      key: "failures",
      label: "Failures, 24 hours",
      state: s.runs.failed24 >= 3 && failureShare >= 0.25 ? "attention" : "ok",
      value: `${s.runs.failed24} of ${ended24}`,
      detail: ended24 === 0 ? "No runs ended in the last 24 hours." : `${Math.round(failureShare * 100)}% of runs that ended failed. Attention from 3 failures and a quarter of runs.`,
    },
    {
      key: "audit",
      label: "Audit chain",
      state: !lastCheck ? "unknown" : !lastCheck.ok || (checkAgeDays ?? 0) > AUDIT_CHECK_DAYS ? "attention" : "ok",
      value: lastCheck ? (lastCheck.ok ? "Intact" : "Break found") : "Not checked",
      detail: !lastCheck
        ? "It has never been checked. Check it from the audit log."
        : !lastCheck.ok
          ? `The last check found a problem at or before event ${lastCheck.through}. See the audit log.`
          : `Checked through event ${lastCheck.through}, ${waitingFor(lastCheck.at, now)} ago${(checkAgeDays ?? 0) > AUDIT_CHECK_DAYS ? `. Check it at least every ${AUDIT_CHECK_DAYS} days` : ""}.`,
      href: "/audit",
    },
    {
      key: "switches",
      label: "Platform switches",
      state: s.paused.length > 0 ? "attention" : "ok",
      value: s.paused.length > 0 ? `${s.paused.length} paused` : "Nothing paused",
      detail: s.paused.length > 0 ? `Paused: ${s.paused.map((k) => (isPlatformFlag(k) ? FLAG_DETAILS[k].label : k)).join(", ")}.` : "Every part of the platform is on.",
      href: "/controls",
    },
    {
      key: "support",
      label: "Support queue",
      state: s.support.waiting > 0 && oldestHours > 24 ? "attention" : "ok",
      value: `${s.support.waiting} waiting`,
      detail:
        s.support.waiting === 0 || !s.support.oldestWaitingAt
          ? "Nobody is waiting on Farbaek."
          : `The oldest has waited ${waitingFor(s.support.oldestWaitingAt, now)}.${oldestHours > 24 ? " That's over a day." : ""}`,
      href: "/support",
    },
  ];
}

export async function loadHealth(admin: SupabaseClient, now = new Date()): Promise<{ checks: HealthCheck[]; snapshot: HealthSnapshot } | { error: string }> {
  const started = performance.now();
  const { data, error } = await admin.rpc("app_office_health", { p_now: now.toISOString() });
  const dbMs = performance.now() - started;
  if (error) return { error: "The database didn't answer the health check. Supabase may be down, or this server can't reach it." };
  const parsed = Snapshot.safeParse(data);
  if (!parsed.success) return { error: "The database answered in an unexpected shape. Migration v23 may not be applied." };
  return { checks: healthChecks(parsed.data, dbMs, now), snapshot: parsed.data };
}

/** What this server process knows about itself. Names and numbers only, never a secret. */
export function serverFacts(env: Record<string, string | undefined> = process.env): { label: string; value: string }[] {
  const memory = process.memoryUsage().rss;
  const info = deploymentInfo(env);
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  return [
    { label: "Deployed commit", value: info.commit?.slice(0, 12) ?? "Local build" },
    { label: "Region", value: info.region?.slice(0, 40) ?? "Not reported" },
    { label: "Up for", value: hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min` },
    { label: "Memory in use", value: `${Math.round(memory / 1_048_576)} MB` },
    { label: "Node.js", value: process.version },
  ];
}
