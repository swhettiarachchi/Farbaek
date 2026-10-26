import { describe, expect, it } from "vitest";
import type { ProbeResult } from "@/core/launch/health";
import { judgeLaunch, runOutcomeWatches, type OutcomeWatchDeps, type WatchTarget, type WatchedProject } from "./outcome-watch";

const probe = (status: number | null, extra: Partial<ProbeResult> = {}): ProbeResult => ({ status, ms: 120, deploymentHeader: null, etag: null, ...extra });
const W = (id: string): WatchedProject => ({ projectId: id, orgId: "o1", projectName: `Project ${id}`, enabledBy: "u1" });

function fakes(targets: Record<string, WatchTarget | { none: string }>, probes: Record<string, ProbeResult>, changes: Record<string, "down" | "recovered" | null> = {}) {
  const recorded: [string, boolean | null, string][] = [];
  const alerts: { projectId: string; kind: string }[] = [];
  const deps: OutcomeWatchDeps = {
    due: async () => Object.keys(targets).map(W),
    target: async (w) => targets[w.projectId]!,
    probe: async (url) => probes[url]!,
    record: async (id, ok, detail) => (recorded.push([id, ok, detail]), changes[id] ?? null),
    alert: async (a) => void alerts.push({ projectId: a.projectId, kind: a.kind }),
    sleep: async () => undefined,
  };
  return { deps, recorded, alerts };
}

describe("outcome watch", () => {
  it("checks a Farbaek Site against exactly the version that should be live", async () => {
    const site: WatchTarget = { kind: "farbaek_site", url: "https://shop.farbaek.si/", deploymentId: "dep-2", indexSha256: null };
    const f = fakes({ p1: site }, { [site.url]: probe(200, { deploymentHeader: "dep-2" }) });
    expect(await runOutcomeWatches(f.deps)).toMatchObject({ checked: 1 });
    expect(f.recorded[0]).toEqual(["p1", true, expect.stringMatching(/^Live and serving this version\. Answered 200/)]);

    const stale = fakes({ p1: site }, { [site.url]: probe(200, { deploymentHeader: "dep-1" }) });
    await runOutcomeWatches(stale.deps);
    expect(stale.recorded[0]![1]).toBe(false);
  });

  it("tells the person who turned it on when it goes down or comes back, and only then", async () => {
    const v: WatchTarget = { kind: "launch", provider: "vercel", url: "https://shop.vercel.app" };
    const f = fakes({ p1: v, p2: v, p3: v }, { [v.url]: probe(null, { error: "timeout" }) }, { p1: "down", p2: null, p3: "recovered" });
    expect(await runOutcomeWatches(f.deps)).toEqual({ checked: 3, nothingLive: 0, down: 1, recovered: 1 });
    expect(f.alerts).toEqual([
      { projectId: "p1", kind: "down" },
      { projectId: "p3", kind: "recovered" },
    ]);
  });

  it("records why when nothing is live, without counting it as down", async () => {
    const f = fakes({ p1: { none: "Nothing is live to check yet." } }, {});
    expect(await runOutcomeWatches(f.deps)).toEqual({ checked: 0, nothingLive: 1, down: 0, recovered: 0 });
    expect(f.recorded).toEqual([["p1", null, "Nothing is live to check yet."]]);
  });

  it("counts a host's own protection as answering, and errors as not", () => {
    expect(judgeLaunch("vercel", probe(200))).toMatchObject({ ok: true });
    expect(judgeLaunch("vercel", probe(401))).toMatchObject({ ok: true, detail: expect.stringMatching(/Vercel's sign-in/) });
    expect(judgeLaunch("vercel", probe(404))).toEqual({ ok: false, detail: "It answered 404." });
    expect(judgeLaunch("vercel", probe(503))).toMatchObject({ ok: false });
    expect(judgeLaunch("vercel", probe(null, { error: "network" }))).toMatchObject({ ok: false });
    expect(judgeLaunch("netlify", probe(401))).toMatchObject({ ok: true, detail: expect.stringMatching(/Netlify's password protection/) });
    expect(judgeLaunch("netlify", probe(403))).toEqual({ ok: false, detail: "It answered 403." });
    expect(judgeLaunch("netlify", probe(200))).toMatchObject({ ok: true });
  });
});
