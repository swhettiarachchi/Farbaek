/**
 * Security check findings and the score (ADR 0024). A finding names one
 * problem in one place, how serious it is, why it matters and how to fix it.
 * The score starts at 100 and loses points per finding by severity, so
 * people can see progress as they fix things. It's a guide, not a
 * certification: the report says what was checked and what wasn't.
 */

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Note",
};

const PENALTY: Record<Severity, number> = { critical: 30, high: 15, medium: 7, low: 3, info: 0 };

/** Where a finding came from: Farbaek's own rules, the package audit, or the AI review. */
export type FindingSource = "rules" | "dependencies" | "ai";

export interface Finding {
  /** Stable within a report, for linking and "Fix with the agent". */
  id: string;
  rule: string;
  severity: Severity;
  source: FindingSource;
  title: string;
  /** Why it matters, in a sentence or two. */
  detail: string;
  /** What to do about it. */
  fix: string;
  file: string | null;
  line: number | null;
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export function scoreOf(findings: readonly Pick<Finding, "severity">[]): { score: number; grade: Grade } {
  const score = Math.max(0, 100 - findings.reduce((n, f) => n + PENALTY[f.severity], 0));
  const grade: Grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  return { score, grade };
}

export function countBySeverity(findings: readonly Pick<Finding, "severity">[]): Record<Severity, number> {
  const out = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  for (const f of findings) out[f.severity] += 1;
  return out;
}

/** Most serious first, then by file and line. */
export function sortFindings<T extends Pick<Finding, "severity" | "file" | "line">>(findings: readonly T[]): T[] {
  return [...findings].sort(
    (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || (a.file ?? "").localeCompare(b.file ?? "") || (a.line ?? 0) - (b.line ?? 0),
  );
}

/** Drops findings that say the same thing about the same place, keeping the most serious. */
export function dedupeFindings<T extends Finding>(findings: readonly T[]): T[] {
  const seen = new Map<string, T>();
  for (const f of sortFindings(findings)) {
    const key = `${f.rule}|${f.file ?? ""}|${f.line ?? ""}`;
    if (!seen.has(key)) seen.set(key, f);
  }
  return [...seen.values()];
}
