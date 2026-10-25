/**
 * The Future-State Arena's comparison (ADR 0076): the same checks run on the
 * project's current files and with a proposed change written over them, in
 * one disposable sandbox, with nothing applied. Each result is observed, from
 * a real exit code; a trial never verifies anything.
 */

export interface ArenaCheck {
  name: string;
  /** Null when the check didn't run or didn't finish. */
  exitCode: number | null;
  durationMs: number | null;
  failure: string | null;
}

export type ArenaCheckState = "passed" | "failed" | "not_run";
export type ArenaChange = "breaks" | "fixes" | "still_passes" | "still_fails" | "not_run";
export type ArenaVerdict = "breaks_checks" | "incomplete" | "fixes_checks" | "keeps_passing" | "still_failing";

export interface ArenaRow {
  name: string;
  before: ArenaCheckState;
  after: ArenaCheckState;
  change: ArenaChange;
}

export const stateOf = (c: ArenaCheck | undefined): ArenaCheckState => (!c || c.exitCode === null ? "not_run" : c.exitCode === 0 ? "passed" : "failed");

function changeOf(before: ArenaCheckState, after: ArenaCheckState): ArenaChange {
  if (before === "not_run" || after === "not_run") return "not_run";
  if (before === "passed") return after === "passed" ? "still_passes" : "breaks";
  return after === "passed" ? "fixes" : "still_fails";
}

/** Pairs the two runs check by check, in the order the contract lists them. */
export function compareArena(baseline: readonly ArenaCheck[], candidate: readonly ArenaCheck[]): { rows: ArenaRow[]; verdict: ArenaVerdict } {
  const count = Math.max(baseline.length, candidate.length);
  const rows: ArenaRow[] = [];
  for (let i = 0; i < count; i++) {
    const name = candidate[i]?.name ?? baseline[i]?.name ?? `Check ${i + 1}`;
    const before = stateOf(baseline[i]);
    const after = stateOf(candidate[i]);
    rows.push({ name, before, after, change: changeOf(before, after) });
  }
  const has = (c: ArenaChange) => rows.some((r) => r.change === c);
  // A break outranks everything: it's what a person most needs before approving.
  const verdict: ArenaVerdict = has("breaks")
    ? "breaks_checks"
    : rows.length === 0 || has("not_run")
      ? "incomplete"
      : has("fixes") && !has("still_fails")
        ? "fixes_checks"
        : has("still_fails")
          ? "still_failing"
          : "keeps_passing";
  return { rows, verdict };
}

/** Dependency manifests: when a change touches one, packages are installed again before its checks. */
export function touchesDependencies(paths: readonly string[]): boolean {
  return paths.some((p) => /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|requirements\.txt|pyproject\.toml|poetry\.lock)$/.test(p));
}
