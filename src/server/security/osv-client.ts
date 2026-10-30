/**
 * Asks OSV.dev which advisories affect a project's locked versions (ADR
 * 0130). Only https://api.osv.dev, only package names and versions. Errors
 * come back as a reason, so the check is reported as skipped, never failed.
 */
import { z } from "zod";
import { osvQueries, type LockedPackage, type OsvAdvisory } from "@/core/security/osv";

const API = "https://api.osv.dev";
const BATCH = 1_000;
const MAX_DETAILS = 40;
const PARALLEL = 8;
const TIMEOUT_MS = 15_000;

const BatchSchema = z.object({ results: z.array(z.object({ vulns: z.array(z.object({ id: z.string().max(100) })).optional() })) });
const AdvisorySchema = z.object({
  id: z.string().max(100),
  summary: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  database_specific: z.object({ severity: z.string().optional() }).passthrough().optional(),
  affected: z
    .array(
      z.object({
        package: z.object({ name: z.string(), ecosystem: z.string() }).optional(),
        ranges: z.array(z.object({ events: z.array(z.record(z.string(), z.string())) })).optional(),
      }),
    )
    .optional(),
});

export type OsvLookup = (pkgs: LockedPackage[]) => Promise<{ ok: true; hits: { pkg: LockedPackage; ids: string[] }[]; details: Map<string, OsvAdvisory> } | { ok: false; reason: string }>;

export function createOsvLookup(fetcher: typeof fetch = fetch): OsvLookup {
  const call = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const res = await fetcher(`${API}${path}`, { ...init, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json", "content-type": "application/json", "user-agent": "Farbaek" } });
    if (!res.ok) throw new Error(`OSV.dev answered ${res.status}`);
    return res.json();
  };

  return async (pkgs) => {
    const hits: { pkg: LockedPackage; ids: string[] }[] = [];
    try {
      for (let i = 0; i < pkgs.length; i += BATCH) {
        const chunk = pkgs.slice(i, i + BATCH);
        const parsed = BatchSchema.safeParse(await call("/v1/querybatch", { method: "POST", body: JSON.stringify(osvQueries(chunk)) }));
        if (!parsed.success || parsed.data.results.length !== chunk.length) return { ok: false, reason: "OSV.dev answered in a way Farbaek didn't expect." };
        parsed.data.results.forEach((r, j) => {
          const ids = (r.vulns ?? []).map((v) => v.id);
          if (ids.length) hits.push({ pkg: chunk[j]!, ids });
        });
      }
    } catch {
      return { ok: false, reason: "Farbaek couldn't reach OSV.dev just now. Run the check again later." };
    }

    // Details for the first advisories; any not fetched still count, by id.
    const wanted = [...new Set(hits.flatMap((h) => h.ids))].slice(0, MAX_DETAILS);
    const details = new Map<string, OsvAdvisory>();
    for (let i = 0; i < wanted.length; i += PARALLEL) {
      await Promise.all(
        wanted.slice(i, i + PARALLEL).map(async (id) => {
          try {
            const a = AdvisorySchema.safeParse(await call(`/v1/vulns/${encodeURIComponent(id)}`));
            if (!a.success) return;
            details.set(id, {
              id: a.data.id,
              summary: a.data.summary ?? null,
              severity: a.data.database_specific?.severity ?? null,
              aliases: a.data.aliases ?? [],
              affected: (a.data.affected ?? []).flatMap((x) => (x.package ? [{ package: x.package, ranges: x.ranges ?? [] }] : [])),
            });
          } catch {
            // Left out: the finding still names the advisory.
          }
        }),
      );
    }
    return { ok: true, hits, details };
  };
}
