/**
 * Agents' pinned tools (ADR 0133), read as the person for the Agents page,
 * with the difference between the pin and any tools waiting for review.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { diffToolManifests, type PinnedTool, type ToolPinView } from "@/core/agent/tool-pins";

const Manifest = z.array(z.object({ name: z.string(), description: z.string(), input_schema: z.record(z.string(), z.unknown()), sha256: z.string() }));

export async function readToolPins(client: SupabaseClient, orgId: string): Promise<Map<string, ToolPinView>> {
  const { data, error } = await client.from("agent_tool_pins").select("agent_id, status, manifest, pending_manifest").eq("org_id", orgId);
  if (error) throw new Error(`Couldn't read the agents' tools: ${error.message}`);
  const out = new Map<string, ToolPinView>();
  for (const r of data ?? []) {
    const manifest = Manifest.safeParse(r.manifest);
    if (!manifest.success) continue;
    const pending = r.pending_manifest ? Manifest.safeParse(r.pending_manifest) : null;
    const quarantined = r.status === "quarantined";
    // What an approval binds to, computed by the database from what's stored.
    const id = quarantined ? await client.rpc("app_agent_tools_pending_id", { p_agent: r.agent_id }) : null;
    out.set(String(r.agent_id), {
      status: quarantined ? "quarantined" : "pinned",
      tools: manifest.data.length,
      pendingId: id && !id.error && typeof id.data === "string" ? id.data : null,
      diff: pending?.success ? diffToolManifests(manifest.data as PinnedTool[], pending.data as PinnedTool[]) : null,
    });
  }
  return out;
}
