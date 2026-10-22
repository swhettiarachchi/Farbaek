/**
 * Live-site health checks (LaunchOS A, ADR 0033): after a site goes live,
 * Farbaek fetches its real address and confirms it serves exactly the
 * deployment that was made live. The site's server names the deployment in
 * a header and tags each file with its SHA-256, so the check proves which
 * files are answering, not only that something answers.
 */
import { siteNameProblem } from "@/core/publish/site";

export const DEPLOYMENT_HEADER = "x-farbaek-deployment";

export const HEALTH_VERDICTS = ["live", "previous", "down", "unreachable"] as const;
export type HealthVerdict = (typeof HEALTH_VERDICTS)[number];

export const VERDICT_WORDS: Record<HealthVerdict, string> = {
  live: "Live and serving this version",
  previous: "Still serving an earlier version",
  down: "Answering with an error",
  unreachable: "Not answering",
};

export interface ProbeResult {
  /** HTTP status, or null when nothing answered. */
  status: number | null;
  ms: number;
  deploymentHeader: string | null;
  etag: string | null;
  error?: "timeout" | "network";
}

export interface HealthResult {
  verdict: HealthVerdict;
  status: number | null;
  ms: number;
  detail: string;
}

/** The only address a check may fetch: https, one valid site name, the configured domain. */
export function siteCheckUrl(name: string, domain: string | null): string | null {
  if (!domain || siteNameProblem(name) !== null) return null;
  const d = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return null;
  return `https://${name}.${d}/`;
}

/** What one answer means for the deployment that should be live and its index.html hash. */
export function judgeProbe(probe: ProbeResult, expected: { deploymentId: string; indexSha256: string | null }): HealthResult {
  const ms = Math.round(probe.ms);
  if (probe.status === null) {
    return { verdict: "unreachable", status: null, ms, detail: probe.error === "timeout" ? "No answer within 8 seconds." : "The address didn't answer. DNS or the network may be down." };
  }
  if (probe.status < 200 || probe.status >= 300) return { verdict: "down", status: probe.status, ms, detail: `It answered ${probe.status}.` };
  if (probe.deploymentHeader !== expected.deploymentId) {
    return { verdict: "previous", status: probe.status, ms, detail: probe.deploymentHeader ? "An earlier version is still answering. Sites update within about 10 seconds." : "It answered without naming a version, so Farbaek can't confirm it." };
  }
  const tag = probe.etag?.replace(/^W\//, "").replaceAll('"', "") ?? null;
  if (expected.indexSha256 && tag !== expected.indexSha256) {
    return { verdict: "previous", status: probe.status, ms, detail: "The version matches, but the home page's contents don't. Check again in a moment." };
  }
  return { verdict: "live", status: probe.status, ms, detail: `Answered ${probe.status} in ${ms} ms with exactly these files.` };
}

/**
 * Checks a site, trying again while an earlier version is still cached.
 * `probe` and `sleep` are passed in, so tests run without a network.
 */
export async function checkSite(
  probe: () => Promise<ProbeResult>,
  expected: { deploymentId: string; indexSha256: string | null },
  options: { attempts?: number; waitMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<HealthResult> {
  const attempts = options.attempts ?? 3;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let result: HealthResult | null = null;
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) await sleep(options.waitMs ?? 4000);
    result = judgeProbe(await probe(), expected);
    if (result.verdict !== "previous") return result;
  }
  return result!;
}
