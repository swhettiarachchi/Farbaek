/**
 * Incidents (ADR 0083): words for their states, and the Incident Replay
 * Theatre. The theatre takes the changes linked to an incident, suggests
 * the narrowest workspace rule that names their files, and shows, change by
 * change, whether that rule would have stopped what happened. It decides
 * nothing: a suggested rule goes to the policy builder, which tests it
 * against past changes before it can be activated (ADR 0082).
 */
import type { PolicyOutcome } from "../billing/usage";
import { OUTCOME_RANK, outcomeOf, type TestOutcome } from "./rules-test";
import { MAX_PATTERNS, matchRules, type RuleEffect } from "./workspace-rules";

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const INCIDENT_STATUSES = ["open", "contained", "resolved"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const INCIDENT_SOURCES = ["manual", "autonomy_failure", "outcome_watch", "pause"] as const;
export type IncidentSource = (typeof INCIDENT_SOURCES)[number];
export const EVENT_KINDS = ["opened", "note", "severity", "status", "check_failed", "recovered", "paused", "resumed", "prevention", "resolved"] as const;
export type IncidentEventKind = (typeof EVENT_KINDS)[number];

export const SEVERITY_WORDS: Record<Severity, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
export const STATUS_WORDS: Record<IncidentStatus, string> = { open: "Open", contained: "Contained", resolved: "Resolved" };
export const SOURCE_WORDS: Record<IncidentSource, string> = {
  manual: "Opened by a person",
  autonomy_failure: "From autonomy",
  outcome_watch: "From the outcome watch",
  pause: "From the emergency pause",
};
export const EVENT_WORDS: Record<IncidentEventKind, string> = {
  opened: "Opened",
  note: "Note",
  severity: "Severity",
  status: "Status",
  check_failed: "Check failed",
  recovered: "Back up",
  paused: "Agents paused",
  resumed: "Agents resumed",
  prevention: "Prevention",
  resolved: "Resolved",
};

/** A change linked to an incident, by its shape: never its content. */
export interface IncidentChange {
  proposalId: string;
  taskId: string;
  /** When it was applied, or proposed when it wasn't. */
  at: string;
  files: { path: string; kind: "create" | "edit" }[];
  /** What the policy decided then. */
  outcome: PolicyOutcome;
}

export interface PreventionRule {
  effect: RuleEffect;
  paths: string[];
  reason: string;
}

/** The narrowest patterns naming every file: one shared folder, else each file's folder, else the files themselves. */
export function patternsFor(paths: readonly string[]): string[] {
  if (paths.length === 0) return [];
  const folders = paths.map((p) => p.split("/").slice(0, -1));
  const shared: string[] = [];
  for (let i = 0; ; i++) {
    const part = folders[0]?.[i];
    if (part === undefined || !folders.every((f) => f[i] === part)) break;
    shared.push(part);
  }
  if (shared.length > 0) return [`${shared.join("/")}/`];
  const out = new Set<string>();
  for (const [i, f] of folders.entries()) out.add(f.length > 0 ? `${f.join("/")}/` : (paths[i] ?? ""));
  return [...out].filter(Boolean).slice(0, MAX_PATTERNS);
}

/** Two rules that name the changes' files: "always a person" holds an automatic apply, "owner or admin" asks for more. */
export function suggestPreventionRules(changes: readonly IncidentChange[], incidentNumber: number): PreventionRule[] {
  const paths = patternsFor([...new Set(changes.flatMap((c) => c.files.map((f) => f.path)))]);
  if (paths.length === 0) return [];
  return [
    { effect: "person_approval", paths, reason: `From incident #${incidentNumber}: a person reviews these files before they change.` },
    { effect: "owner_approval", paths, reason: `From incident #${incidentNumber}: an owner or admin approves changes to these files.` },
  ];
}

const EFFECT_OUTCOME: Record<RuleEffect, TestOutcome> = { block: "stopped", owner_approval: "owner", person_approval: "person" };

export interface ReplayStep {
  change: IncidentChange;
  /** What the change needed then. */
  then: TestOutcome;
  /** What it would have needed with each suggested rule, and whether that's stricter than what happened. */
  withRule: { effect: RuleEffect; outcome: TestOutcome; stricter: boolean }[];
}

/** Replays each linked change with each suggested rule added. Rules only ever make a change stricter. */
export function replayIncident(changes: readonly IncidentChange[], suggestions: readonly PreventionRule[]): ReplayStep[] {
  return changes.map((change) => {
    const then = outcomeOf(change.outcome);
    return {
      change,
      then,
      withRule: suggestions.map((s) => {
        const rule = { id: "suggested", effect: s.effect, paths: s.paths, reason: s.reason };
        const hit = change.files.some((f) => matchRules([rule], f.path).length > 0);
        const ruled = EFFECT_OUTCOME[s.effect];
        const outcome = hit && OUTCOME_RANK[ruled] > OUTCOME_RANK[then] ? ruled : then;
        return { effect: s.effect, outcome, stricter: OUTCOME_RANK[outcome] > OUTCOME_RANK[then] };
      }),
    };
  });
}

/** How the linked changes were found, said plainly. */
export function linkWords(exact: boolean, hours: number): string {
  return exact
    ? "The change this incident is about."
    : `Changes applied in the ${hours} hours before the incident opened. Farbaek can't tell which, if any, caused it.`;
}
