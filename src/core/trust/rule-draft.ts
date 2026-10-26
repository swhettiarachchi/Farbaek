/**
 * Drafting workspace rules from a person's words (ADR 0082). A model turns
 * the request into structured rules plus what it had to assume and what
 * rules can't express. Its output is untrusted: it only prefills the
 * builder, every pattern is checked here, and nothing applies until a
 * person reviews, tests and activates the exact set.
 */
import { z } from "zod";
import { compilePattern, normalizePattern } from "./path-pattern";
import { MAX_PATTERNS, MAX_REASON, RULE_EFFECTS, type RuleEffect } from "./workspace-rules";

export const MAX_REQUEST = 600;
const MAX_DRAFTED = 10;

export const PolicyDraftSchema = z.object({
  rules: z
    .array(
      z.object({
        paths: z.array(z.string().max(200)).describe("File patterns from the project's root, for example src/billing/ or *.sql."),
        effect: z.enum(RULE_EFFECTS).describe("block, owner_approval or person_approval."),
        reason: z.string().max(MAX_REASON).describe("Why, in one short plain sentence from the person's request."),
      }),
    )
    .describe("One rule per distinct set of files and effect."),
  ambiguities: z.array(z.string().max(300)).describe("What you assumed because the request didn't say. Empty when nothing."),
  unsupported: z.array(z.string().max(300)).describe("Parts of the request that rules can't express. Empty when nothing."),
});

export type PolicyDraftOutput = z.infer<typeof PolicyDraftSchema>;

export interface DraftRequest {
  request: string;
  /** The workspace's folders, so patterns can match real paths. */
  folders: string[];
}

export interface AcceptedDraft {
  rules: { paths: string[]; effect: RuleEffect; reason: string }[];
  ambiguities: string[];
  unsupported: string[];
  /** Patterns left out because they weren't valid, with why. */
  dropped: string[];
}

const clean = (s: string, max: number) => s.trim().replace(/\s+/g, " ").slice(0, max);

/** Keeps only what a rule can hold: valid patterns, known effects, short text. */
export function acceptDraft(output: PolicyDraftOutput): AcceptedDraft {
  const dropped: string[] = [];
  const rules: AcceptedDraft["rules"] = [];
  for (const r of output.rules.slice(0, MAX_DRAFTED)) {
    const paths: string[] = [];
    for (const raw of r.paths) {
      const p = normalizePattern(raw);
      const c = compilePattern(p);
      if (c.ok) {
        if (!paths.includes(p)) paths.push(p);
      } else if (p) dropped.push(`${p.slice(0, 80)}: ${c.error}`);
    }
    if (paths.length === 0) continue;
    rules.push({ paths: paths.slice(0, MAX_PATTERNS), effect: r.effect, reason: clean(r.reason, MAX_REASON) || "Drafted from your description." });
  }
  return {
    rules,
    ambiguities: output.ambiguities.slice(0, 5).map((a) => clean(a, 300)).filter(Boolean),
    unsupported: output.unsupported.slice(0, 5).map((a) => clean(a, 300)).filter(Boolean),
    dropped: dropped.slice(0, 10),
  };
}

/** Folder names from file paths, up to three levels deep, at most 200, sorted. */
export function foldersOf(paths: readonly string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/").slice(0, -1);
    for (let i = 1; i <= Math.min(parts.length, 3); i++) out.add(`${parts.slice(0, i).join("/")}/`);
    if (out.size >= 200) break;
  }
  return [...out].sort().slice(0, 200);
}
