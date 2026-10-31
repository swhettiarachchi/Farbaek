/**
 * A project's past incidents for the Failure Futures Lab (ADR 0145): each
 * one's title and outcome, and the files of the changes it's linked to, the
 * same way the Incident Replay Theatre links them (migration v53): its own
 * change when it names one, otherwise the changes applied in the project in
 * the 24 hours before it opened. Paths only, never file contents.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { IncidentMemory } from "@/core/realityloop/failure-futures";

/** The most recent incidents considered. */
export const INCIDENT_MEMORY_LIMIT = 8;
const DAY_MS = 86_400_000;

const IncidentRow = z.object({ number: z.number().int(), title: z.string(), outcome: z.string().nullable(), proposal_id: z.string().nullable(), opened_at: z.string() });
const ProposalRow = z.object({ id: z.string(), decided_at: z.string().nullable() });
const RevisionRow = z.object({ proposal_id: z.string().nullable(), path: z.string() });

export async function readIncidentMemories(client: SupabaseClient, orgId: string, projectId: string, limit = INCIDENT_MEMORY_LIMIT): Promise<IncidentMemory[]> {
  if (!z.uuid().safeParse(projectId).success) return [];
  const { data, error } = await client.from("incidents").select("number, title, outcome, proposal_id, opened_at").eq("org_id", orgId).eq("project_id", projectId).order("opened_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Couldn't read the project's incidents: ${error.message}`);
  const incidents = z.array(IncidentRow).parse(data ?? []);
  if (incidents.length === 0) return [];

  // Changes applied in the day before any of the incidents that don't name their own.
  const loose = incidents.filter((i) => i.proposal_id === null);
  let window: z.infer<typeof ProposalRow>[] = [];
  if (loose.length > 0) {
    const times = loose.map((i) => Date.parse(i.opened_at));
    const { data: rows, error: e } = await client
      .from("change_proposals")
      .select("id, decided_at")
      .eq("org_id", orgId)
      .eq("project_id", projectId)
      .eq("status", "applied")
      .gte("decided_at", new Date(Math.min(...times) - DAY_MS).toISOString())
      .lte("decided_at", new Date(Math.max(...times)).toISOString())
      .order("decided_at", { ascending: false })
      .limit(50);
    if (e) throw new Error(`Couldn't read the changes before the incidents: ${e.message}`);
    window = z.array(ProposalRow).parse(rows ?? []);
  }

  const linked = new Map<number, string[]>();
  for (const i of incidents) {
    if (i.proposal_id) {
      linked.set(i.number, [i.proposal_id]);
      continue;
    }
    const opened = Date.parse(i.opened_at);
    // At most five, newest first, as the theatre shows them.
    const ids = window.filter((p) => p.decided_at && Date.parse(p.decided_at) <= opened && Date.parse(p.decided_at) >= opened - DAY_MS).slice(0, 5).map((p) => p.id);
    if (ids.length > 0) linked.set(i.number, ids);
  }
  const ids = [...new Set([...linked.values()].flat())];
  if (ids.length === 0) return [];
  const { data: revs, error: re } = await client.from("project_file_revisions").select("proposal_id, path").eq("org_id", orgId).eq("project_id", projectId).in("proposal_id", ids).limit(2000);
  if (re) throw new Error(`Couldn't read the incidents' files: ${re.message}`);
  const paths = new Map<string, Set<string>>();
  for (const r of z.array(RevisionRow).parse(revs ?? [])) {
    if (!r.proposal_id) continue;
    const set = paths.get(r.proposal_id) ?? new Set<string>();
    set.add(r.path);
    paths.set(r.proposal_id, set);
  }

  return incidents.flatMap((i) => {
    const files = [...new Set((linked.get(i.number) ?? []).flatMap((id) => [...(paths.get(id) ?? [])]))];
    return files.length === 0 ? [] : [{ number: i.number, title: i.title, outcome: i.outcome, exact: i.proposal_id !== null, paths: files }];
  });
}
