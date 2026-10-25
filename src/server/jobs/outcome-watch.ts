/**
 * Outcome watch (ADR 0080), part of the hourly jobs: for each watched
 * project, check what's live (its Farbaek Site against exactly the version
 * that should be live, or its latest Vercel launch's public address), record
 * the result, and tell the person who turned the watch on when it goes down
 * or comes back. The database decides the state; this only checks and tells.
 */
import { VERDICT_WORDS, checkSite, type ProbeResult } from "@/core/launch/health";

export type WatchTarget = { kind: "farbaek_site"; url: string; deploymentId: string; indexSha256: string | null } | { kind: "vercel"; url: string };

export interface WatchedProject {
  projectId: string;
  orgId: string;
  projectName: string;
  enabledBy: string | null;
}

export interface OutcomeWatchDeps {
  /** Watches not checked in the last 50 minutes. */
  due(): Promise<WatchedProject[]>;
  /** What's live for a project, or why nothing is. */
  target(watch: WatchedProject): Promise<WatchTarget | { none: string }>;
  probe(url: string): Promise<ProbeResult>;
  record(projectId: string, ok: boolean | null, detail: string): Promise<"down" | "recovered" | null>;
  alert(input: { userId: string; projectId: string; projectName: string; kind: "down" | "recovered"; detail: string }): Promise<void>;
  sleep?(ms: number): Promise<void>;
}

/** What a Vercel address's answer means: sign-in protection still counts as answering. */
export function judgeVercel(probe: ProbeResult): { ok: boolean; detail: string } {
  if (probe.status === null) return { ok: false, detail: probe.error === "timeout" ? "No answer within 8 seconds." : "The address didn't answer." };
  if (probe.status === 401 || probe.status === 403) return { ok: true, detail: `Answering behind Vercel's sign-in (${probe.status}).` };
  if (probe.status >= 200 && probe.status < 400) return { ok: true, detail: `Answering (${probe.status}) in ${Math.round(probe.ms)} ms.` };
  return { ok: false, detail: `It answered ${probe.status}.` };
}

export async function runOutcomeWatches(deps: OutcomeWatchDeps): Promise<{ checked: number; nothingLive: number; down: number; recovered: number }> {
  const summary = { checked: 0, nothingLive: 0, down: 0, recovered: 0 };
  for (const watch of await deps.due()) {
    const target = await deps.target(watch);
    if ("none" in target) {
      await deps.record(watch.projectId, null, target.none);
      summary.nothingLive++;
      continue;
    }
    let ok: boolean;
    let detail: string;
    if (target.kind === "farbaek_site") {
      const result = await checkSite(() => deps.probe(target.url), { deploymentId: target.deploymentId, indexSha256: target.indexSha256 }, { sleep: deps.sleep });
      ok = result.verdict === "live";
      detail = `${VERDICT_WORDS[result.verdict]}. ${result.detail}`;
    } else {
      ({ ok, detail } = judgeVercel(await deps.probe(target.url)));
    }
    summary.checked++;
    const change = await deps.record(watch.projectId, ok, detail);
    if (change && watch.enabledBy) {
      await deps.alert({ userId: watch.enabledBy, projectId: watch.projectId, projectName: watch.projectName, kind: change, detail }).catch(() => undefined);
    }
    if (change === "down") summary.down++;
    if (change === "recovered") summary.recovered++;
  }
  return summary;
}
