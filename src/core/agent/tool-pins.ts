/**
 * Tool Definition Pinning (ADR 0133): an agent's tools, as the model sees
 * them, each reduced to its name, description and input schema and hashed.
 * A changed description or schema changes that tool's hash, so a tampered
 * or updated tool can't reach the model until someone reviews it.
 */
import { canonicalHash } from "../trust/canonical-json";

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface PinnedTool extends ToolDefinition {
  sha256: string;
}

/** The tools sorted by name, each with its own hash. */
export async function toolManifest(tools: readonly ToolDefinition[]): Promise<PinnedTool[]> {
  const out = await Promise.all(
    tools.map(async (t) => {
      const def = { name: t.name, description: t.description, input_schema: t.input_schema };
      return { ...def, sha256: await canonicalHash({ schema: "farbaek.tool/v1", ...def }) };
    }),
  );
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export interface ToolDiff {
  added: string[];
  removed: string[];
  changed: { name: string; description: { from: string; to: string } | null; schemaChanged: boolean }[];
}

/** What changed between the pinned tools and the ones waiting for review. */
export function diffToolManifests(pinned: readonly PinnedTool[], next: readonly PinnedTool[]): ToolDiff {
  const before = new Map(pinned.map((t) => [t.name, t]));
  const after = new Map(next.map((t) => [t.name, t]));
  const changed: ToolDiff["changed"] = [];
  for (const [name, t] of after) {
    const old = before.get(name);
    if (!old || old.sha256 === t.sha256) continue;
    const descriptionChanged = old.description !== t.description;
    changed.push({ name, description: descriptionChanged ? { from: old.description, to: t.description } : null, schemaChanged: !descriptionChanged || JSON.stringify(old.input_schema) !== JSON.stringify(t.input_schema) });
  }
  return {
    added: [...after.keys()].filter((n) => !before.has(n)).sort(),
    removed: [...before.keys()].filter((n) => !after.has(n)).sort(),
    changed: changed.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** An agent's pin as the Agents page shows it. */
export interface ToolPinView {
  status: "pinned" | "quarantined";
  tools: number;
  /** What an approval is bound to; null when nothing waits. */
  pendingId: string | null;
  diff: ToolDiff | null;
}

export const TOOLS_CHANGED =
  "This agent's tools changed since they were approved, so its model steps are paused. An owner or admin can review the change on the Agents page.";
