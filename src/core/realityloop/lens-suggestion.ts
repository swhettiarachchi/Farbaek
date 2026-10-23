/**
 * AI suggestions in the Intent Diff Lens (spec §25, ADR 0044). On request,
 * a model names the contract clause each hunk serves, or none, with a short
 * reason. Its output is untrusted: only hunks that were sent and clauses
 * that exist are kept. A suggestion sits beside the exact checks and never
 * changes them, so a hunk outside the contract's paths stays flagged
 * whatever the model says.
 */
import { z } from "zod";
import type { ProposedChange } from "./change-proposal";
import type { IntentContract } from "./contract";
import { hunkRange, type FileLens, type LensHunk } from "./intent-lens";

/** Lines of one hunk sent to the model, at most, on each side. */
const MAX_LINES = 40;
const MAX_LINE_CHARS = 300;
/** Hunks sent in one request, at most. */
export const MAX_SUGGESTION_HUNKS = 60;

export const LensSuggestionSchema = z.object({
  mappings: z
    .array(
      z.object({
        hunk: z.string().max(20),
        clause: z.string().max(40),
        reason: z.string().max(400),
      }),
    )
    .max(MAX_SUGGESTION_HUNKS),
});
export type LensSuggestionOutput = z.infer<typeof LensSuggestionSchema>;

export interface LensRequest {
  clauses: { id: string; label: string; statement: string }[];
  hunks: { id: string; path: string; range: string; reason: string; flags: string[]; removed: string[]; added: string[] }[];
}

/** One accepted mapping: a clause the contract has, or none. */
export interface LensSuggestionMapping {
  hunk: string;
  clause: string;
  reason: string;
}

export interface StoredLensSuggestion {
  mappings: LensSuggestionMapping[];
  model: string;
  createdAt: string;
}

export type LensAi = { clause: string; label: string; statement: string; reason: string } | { none: true; reason: string };

export interface SuggestedLensHunk extends LensHunk {
  ai: LensAi | null;
}

export interface SuggestedFileLens extends FileLens {
  hunks: SuggestedLensHunk[];
}

export const hunkId = (file: number, hunk: number) => `f${file}h${hunk}`;

const cut = (lines: readonly string[]) => lines.slice(0, MAX_LINES).map((l) => (l.length > MAX_LINE_CHARS ? `${l.slice(0, MAX_LINE_CHARS)}…` : l));

const clausesOf = (contract: IntentContract) => [
  { id: "outcome", label: "Outcome", statement: contract.outcome },
  ...contract.acceptanceCriteria.map((c) => ({ id: c.id, label: c.id.toUpperCase(), statement: c.statement })),
];

/** What the model reads, as data: the clauses, then each hunk with what the exact checks found. */
export function lensRequest(contract: IntentContract, lenses: readonly FileLens[], changes: readonly Pick<ProposedChange, "path" | "reason">[]): LensRequest {
  const hunks: LensRequest["hunks"] = [];
  lenses.forEach((lens, f) => {
    const reason = changes.find((c) => c.path === lens.path)?.reason ?? "";
    lens.hunks.forEach((h, i) => {
      if (hunks.length >= MAX_SUGGESTION_HUNKS) return;
      hunks.push({ id: hunkId(f, i), path: lens.path, range: hunkRange(h.hunk), reason: reason.slice(0, 300), flags: h.flags.map((x) => x.detail), removed: cut(h.hunk.removed), added: cut(h.hunk.added) });
    });
  });
  return { clauses: clausesOf(contract), hunks };
}

/** Keeps only mappings for hunks that were sent and clauses that exist ("none" included), once per hunk. */
export function acceptSuggestion(request: LensRequest, output: LensSuggestionOutput): LensSuggestionMapping[] {
  const hunks = new Set(request.hunks.map((h) => h.id));
  const clauses = new Set([...request.clauses.map((c) => c.id), "none"]);
  const seen = new Set<string>();
  const out: LensSuggestionMapping[] = [];
  for (const m of output.mappings) {
    const clause = m.clause.trim().toLowerCase();
    if (!hunks.has(m.hunk) || !clauses.has(clause) || seen.has(m.hunk)) continue;
    seen.add(m.hunk);
    out.push({ hunk: m.hunk, clause, reason: m.reason.replace(/\s+/g, " ").trim().slice(0, 200) });
  }
  return out;
}

/**
 * Each hunk with the model's view beside it. Flags, the word pointer and
 * "unexplained" are left exactly as the exact checks set them.
 */
export function withSuggestion(contract: IntentContract, lenses: readonly FileLens[], mappings: readonly LensSuggestionMapping[] | null): SuggestedFileLens[] {
  const clauses = new Map(clausesOf(contract).map((c) => [c.id, c]));
  const byHunk = new Map((mappings ?? []).map((m) => [m.hunk, m]));
  return lenses.map((lens, f) => ({
    ...lens,
    hunks: lens.hunks.map((h, i): SuggestedLensHunk => {
      const m = byHunk.get(hunkId(f, i));
      if (!m) return { ...h, ai: null };
      const clause = clauses.get(m.clause);
      return { ...h, ai: clause ? { clause: clause.id, label: clause.label, statement: clause.statement, reason: m.reason } : { none: true, reason: m.reason } };
    }),
  }));
}
