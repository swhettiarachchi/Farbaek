/**
 * Live-site health checks on the server (LaunchOS A, ADR 0033). The only
 * address fetched is built from a validated site name and the configured
 * site domain (`siteCheckUrl`), redirects are not followed and nothing from
 * the answer is kept beyond its status, two headers and the time it took.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DEPLOYMENT_HEADER, checkSite, siteCheckUrl, type HealthResult, type HealthVerdict, type ProbeResult } from "@/core/launch/health";

const TIMEOUT_MS = 8000;

/** One GET of a site's home page. The body is never read. */
export async function probeSite(url: string): Promise<ProbeResult> {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { "user-agent": "FarbaekLiveCheck/1 (+https://www.farbaek.com)", accept: "text/html" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await res.body?.cancel().catch(() => undefined);
    return { status: res.status, ms: performance.now() - started, deploymentHeader: res.headers.get(DEPLOYMENT_HEADER), etag: res.headers.get("etag") };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { status: null, ms: performance.now() - started, deploymentHeader: null, etag: null, error: timeout ? "timeout" : "network" };
  }
}

/** The SHA-256 of the home page in a deployment, from its recorded file list. */
export async function deploymentIndexSha(client: SupabaseClient, orgId: string, deploymentId: string): Promise<string | null> {
  const { data } = await client.from("site_deployments").select("files").eq("org_id", orgId).eq("id", deploymentId).maybeSingle();
  const files = z.object({ files: z.array(z.object({ path: z.string(), sha256: z.string() })) }).safeParse(data);
  return files.success ? (files.data.files.find((f) => f.path === "index.html")?.sha256 ?? null) : null;
}

export type LiveCheckOutcome =
  | { ok: true; result: HealthResult }
  | { ok: false; reason: "no_domain" | "limit" | "not_found" | "failed"; message: string };

/** Runs a check against the live site and records it. `probe` is replaceable for tests. */
export async function runLiveCheck(
  input: { admin: SupabaseClient; actor: string; domain: string | null; site: { id: string; name: string }; deploymentId: string; indexSha256: string | null },
  probe: (url: string) => Promise<ProbeResult> = probeSite,
): Promise<LiveCheckOutcome> {
  const url = siteCheckUrl(input.site.name, input.domain);
  if (!url) return { ok: false, reason: "no_domain", message: "This deployment has no site domain set, so there's no public address to check." };
  const result = await checkSite(() => probe(url), { deploymentId: input.deploymentId, indexSha256: input.indexSha256 });
  const { error } = await input.admin.rpc("app_record_site_health", {
    p_actor: input.actor,
    p_site: input.site.id,
    p_deployment: input.deploymentId,
    p_verdict: result.verdict,
    p_status: result.status,
    p_ms: result.ms,
    p_detail: result.detail,
  });
  if (error?.message.includes("CHECK_LIMIT")) return { ok: false, reason: "limit", message: "This site was checked several times just now. Try again in a minute." };
  if (error?.message.includes("NOT_FOUND")) return { ok: false, reason: "not_found", message: "That site or version isn't in this workspace." };
  if (error) return { ok: false, reason: "failed", message: "The check ran but couldn't be saved. Try again in a moment." };
  return { ok: true, result };
}

export interface HealthRecord {
  deploymentId: string;
  verdict: HealthVerdict;
  statusCode: number | null;
  ms: number;
  detail: string;
  checkedAt: string;
}

/** The latest check of each of a site's deployments, read through RLS. */
export async function latestChecksBySite(client: SupabaseClient, orgId: string, siteId: string): Promise<Map<string, HealthRecord>> {
  const { data, error } = await client
    .from("site_health_checks")
    .select("deployment_id, verdict, status_code, ms, detail, checked_at")
    .eq("org_id", orgId)
    .eq("site_id", siteId)
    .order("checked_at", { ascending: false })
    .limit(100);
  const latest = new Map<string, HealthRecord>();
  if (error) return latest;
  const rows = z
    .array(z.object({ deployment_id: z.string(), verdict: z.enum(["live", "previous", "down", "unreachable"]), status_code: z.number().nullable(), ms: z.number(), detail: z.string(), checked_at: z.string() }))
    .safeParse(data);
  if (!rows.success) return latest;
  for (const r of rows.data) {
    if (!latest.has(r.deployment_id)) latest.set(r.deployment_id, { deploymentId: r.deployment_id, verdict: r.verdict, statusCode: r.status_code, ms: r.ms, detail: r.detail, checkedAt: r.checked_at });
  }
  return latest;
}
