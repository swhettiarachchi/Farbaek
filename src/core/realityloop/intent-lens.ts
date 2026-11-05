/**
 * The Intent Diff Lens (spec §25, ADR 0041): each hunk of a proposed change
 * read against the contract it was made under.
 *
 * Deterministic checks come first and are never overridden: a file outside
 * the contract's paths, an operation the contract doesn't allow, a changed
 * line that names a protected field. Then a pointer: the acceptance
 * criterion (or the outcome) whose distinctive words the hunk shares with
 * its lines, its file and the agent's reason. That's a suggestion found by
 * words, not proof, and the review says so. A hunk with neither is marked
 * unexplained, for a person to look at.
 */
import { CHANGE_OPERATIONS, pathScope } from "./change-proposal";
import { checkActionAgainstContract, type IntentContract } from "./contract";
import { diffLines, type Hunk } from "./line-diff";

export type LensFlagKind = "outside_paths" | "operation" | "protected_field";

export interface LensFlag {
  kind: LensFlagKind;
  detail: string;
}

export interface LensMatch {
  /** The criterion's id ("ac-2"), or "outcome". */
  id: string;
  label: string;
  statement: string;
  /** The words the hunk shares with it, for the reviewer to judge. */
  shared: string[];
}

export interface LensHunk {
  hunk: Hunk;
  flags: LensFlag[];
  match: LensMatch | null;
  unexplained: boolean;
}

export interface FileLens {
  path: string;
  hunks: LensHunk[];
}

/** Words too common in prose or code to say anything about intent. */
const STOP = new Set(
  (
    "the and for with that this from into when then are was were has have had can not all any each its our your you use uses used using should must will " +
    "only also more less than page file files line lines change changes changed make makes made new add adds added update updates updated set get gets " +
    "const let var function return import export default class interface type true false null undefined async await else while div span classname " +
    "props string number boolean void extends implements public private static html css src tsx jsx json index item items value values data name names " +
    "text one two its it's there their them they what which who how but out some other just like into about over under after before where here"
  ).split(/\s+/),
);

/** Lower-case words of three letters or more, camelCase and snake_case split, without the stop list. */
export function distinctiveWords(text: string): Set<string> {
  const out = new Set<string>();
  const spaced = text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_\-./\\]+/g, " ");
  for (const raw of spaced.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw) || /^\d+$/.test(raw)) continue;
    // A light stem, so "quantity" meets "quantities" and "rejects" meets "reject".
    out.add(raw.replace(/(ies|es|s)$/, (m) => (m === "ies" ? "y" : "")));
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether a line names a field as a whole identifier, not inside a longer one. */
function namesField(line: string, field: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9_$])${escapeRegex(field)}($|[^A-Za-z0-9_$])`).test(line);
}

function bestMatch(contract: IntentContract, words: Set<string>): LensMatch | null {
  const candidates = [
    ...contract.acceptanceCriteria.map((c) => ({ id: c.id, label: c.id.toUpperCase(), statement: c.statement })),
    { id: "outcome", label: "Outcome", statement: contract.outcome },
  ];
  let best: LensMatch | null = null;
  for (const c of candidates) {
    const shared = [...distinctiveWords(c.statement)].filter((w) => words.has(w));
    // Two shared words, or one long, specific one.
    const enough = shared.length >= 2 || shared.some((w) => w.length >= 7);
    if (enough && (!best || shared.length > best.shared.length)) best = { ...c, shared };
  }
  return best;
}

/** The lens for one proposed file: its hunks, each read against the contract. */
export function lensForChange(contract: IntentContract, change: { path: string; kind: "create" | "edit"; content: string; reason: string }, base: string): FileLens {
  const fileFlags: LensFlag[] = [];
  const scope = pathScope(contract);
  if (scope.length > 0 && !scope.some((s) => change.path === s || change.path.startsWith(`${s}/`))) {
    fileFlags.push({ kind: "outside_paths", detail: `Outside the plan's paths (${scope.join(", ")})` });
  }
  for (const v of checkActionAgainstContract(contract, { operation: CHANGE_OPERATIONS[change.kind], fields: [], recordCount: 1 })) {
    if (v.kind === "FORBIDDEN_OPERATION" || v.kind === "OPERATION_NOT_ALLOWED") fileFlags.push({ kind: "operation", detail: v.detail });
  }
  const context = distinctiveWords(`${change.path} ${change.reason}`);

  const hunks = diffLines(change.kind === "create" ? "" : base, change.content).map((hunk): LensHunk => {
    const lines = [...hunk.removed, ...hunk.added];
    const flags = [...fileFlags];
    for (const field of contract.protectedFields) {
      if (lines.some((l) => namesField(l, field))) flags.push({ kind: "protected_field", detail: `Touches the protected field ${field}` });
    }
    const words = new Set([...context, ...distinctiveWords(lines.join(" "))]);
    // Deterministic flags stand whatever the words say; a match is only a pointer.
    const match = bestMatch(contract, words);
    return { hunk, flags, match, unexplained: flags.length === 0 && match === null };
  });
  return { path: change.path, hunks };
}

export interface LensSummary {
  hunks: number;
  matched: number;
  unexplained: number;
  outside: number;
  flagged: number;
}

export function lensSummary(lenses: readonly FileLens[]): LensSummary {
  const all = lenses.flatMap((l) => l.hunks);
  return {
    hunks: all.length,
    matched: all.filter((h) => h.flags.length === 0 && h.match).length,
    unexplained: all.filter((h) => h.unexplained).length,
    outside: all.filter((h) => h.flags.some((f) => f.kind === "outside_paths")).length,
    flagged: all.filter((h) => h.flags.length > 0).length,
  };
}

/** "Lines 12–18" as people read it; a pure deletion names where it was. */
export function hunkRange(h: Hunk): string {
  if (h.newLines === 0) return h.oldLines === 1 ? `Removed line ${h.oldStart}` : `Removed lines ${h.oldStart} to ${h.oldStart + h.oldLines - 1}`;
  return h.newLines === 1 ? `Line ${h.newStart}` : `Lines ${h.newStart} to ${h.newStart + h.newLines - 1}`;
}
