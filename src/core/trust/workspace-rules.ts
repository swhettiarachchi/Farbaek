/**
 * Workspace rules (ADR 0082): an owner's or admin's own rules on top of
 * Farbaek's built-in change policy. A rule names files by pattern and what a
 * change to them needs. Rules can only make a change wait longer or stop it,
 * never let more through.
 *
 * A rule set is versioned and hashed with the same canonical JSON as
 * approvals. The person activates the exact set they reviewed and tested,
 * bound by that hash, and every decision records which version decided.
 */
import type { PolicyOutcome } from "../billing/usage";
import { canonicalHash } from "./canonical-json";
import { compilePattern, describePattern, matchesPattern, normalizePattern } from "./path-pattern";

export const RULES_SCHEMA = "farbaek.workspace-rules/v1";
export const MAX_RULES = 20;
export const MAX_PATTERNS = 10;
export const MAX_REASON = 200;

export const RULE_EFFECTS = ["block", "owner_approval", "person_approval"] as const;
export type RuleEffect = (typeof RULE_EFFECTS)[number];

export const EFFECTS: Record<RuleEffect, { label: string; outcome: PolicyOutcome; sentence: string; rank: number }> = {
  block: { label: "Stop the change", outcome: "BLOCK", sentence: "is stopped, and no one can approve it", rank: 3 },
  owner_approval: { label: "Owner or admin approves", outcome: "ESCALATE", sentence: "needs an owner or admin to approve", rank: 2 },
  person_approval: { label: "Always a person", outcome: "REQUIRE_APPROVAL", sentence: "always waits for a person, even at autonomy level 2", rank: 1 },
};

export interface WorkspaceRule {
  id: string;
  paths: string[];
  effect: RuleEffect;
  /** Why, in the person's words. Reviewers see it with every change it governs. */
  reason: string;
}

export interface WorkspaceRuleSet {
  schema: typeof RULES_SCHEMA;
  rules: WorkspaceRule[];
}

/** The version that governs a workspace now. */
export interface ActiveRules {
  version: number;
  sha256: string;
  rules: WorkspaceRule[];
}

/** What the database keeps to check each change again: patterns as anchored regexes. */
export interface CompiledRule {
  id: string;
  effect: RuleEffect;
  regex: string[];
}

export interface RuleError {
  /** The rule's position, or null for the set as a whole. */
  rule: number | null;
  field: "paths" | "reason" | "effect" | "id" | "rules";
  message: string;
}

export type ParsedRules = { ok: true; set: WorkspaceRuleSet } | { ok: false; errors: RuleError[] };

const ID = /^[a-z0-9-]{1,40}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Validates a rule set from anywhere (a form, a model, the database) and returns it normalized, or every error. */
export function parseRuleSet(input: unknown): ParsedRules {
  const errors: RuleError[] = [];
  const raw = isRecord(input) && Array.isArray(input.rules) ? input.rules : null;
  if (!raw) return { ok: false, errors: [{ rule: null, field: "rules", message: "The rules couldn't be read." }] };
  if (raw.length > MAX_RULES) errors.push({ rule: null, field: "rules", message: `Keep to ${MAX_RULES} rules or fewer.` });
  const ids = new Set<string>();
  const rules: WorkspaceRule[] = [];
  raw.slice(0, MAX_RULES).forEach((r, i) => {
    if (!isRecord(r)) {
      errors.push({ rule: i, field: "rules", message: "This rule couldn't be read." });
      return;
    }
    const id = typeof r.id === "string" ? r.id : "";
    if (!ID.test(id)) errors.push({ rule: i, field: "id", message: "This rule has no valid id." });
    else if (ids.has(id)) errors.push({ rule: i, field: "id", message: "Two rules share an id." });
    ids.add(id);

    const effect = RULE_EFFECTS.find((e) => e === r.effect);
    if (!effect) errors.push({ rule: i, field: "effect", message: "Choose what a change to these files needs." });

    const paths = (Array.isArray(r.paths) ? r.paths : []).filter((p): p is string => typeof p === "string").map(normalizePattern).filter((p) => p !== "");
    if (paths.length === 0) errors.push({ rule: i, field: "paths", message: "Add at least one file pattern." });
    if (paths.length > MAX_PATTERNS) errors.push({ rule: i, field: "paths", message: `Use ${MAX_PATTERNS} patterns or fewer in a rule.` });
    for (const p of paths) {
      const c = compilePattern(p);
      if (!c.ok) errors.push({ rule: i, field: "paths", message: `${p}: ${c.error}` });
    }

    const reason = typeof r.reason === "string" ? r.reason.trim().replace(/\s+/g, " ") : "";
    if (reason.length < 3) errors.push({ rule: i, field: "reason", message: "Say why, so reviewers know." });
    if (reason.length > MAX_REASON) errors.push({ rule: i, field: "reason", message: `Keep the reason under ${MAX_REASON} characters.` });

    if (effect) rules.push({ id, paths: [...new Set(paths)], effect, reason });
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, set: { schema: RULES_SCHEMA, rules } };
}

/** The set's version hash, as the person reviewed it. */
export function ruleSetHash(set: WorkspaceRuleSet): Promise<string> {
  return canonicalHash(set);
}

/** Patterns as regexes, for the database's own check. Only call with a parsed set. */
export function compileRuleSet(set: WorkspaceRuleSet): CompiledRule[] {
  return set.rules.map((r) => ({
    id: r.id,
    effect: r.effect,
    regex: r.paths.map((p) => {
      const c = compilePattern(p);
      if (!c.ok) throw new Error(`Invalid pattern in a parsed rule set: ${p}`);
      return c.regex;
    }),
  }));
}

/** The rule in plain words, decided by Farbaek's code, not a model. */
export function explainRule(rule: Pick<WorkspaceRule, "paths" | "effect">): string {
  const things = rule.paths.map(describePattern);
  const list = things.length <= 1 ? (things[0] ?? "these files") : `${things.slice(0, -1).join(", ")} or ${things[things.length - 1]}`;
  return `A change to ${list} ${EFFECTS[rule.effect].sentence}.`;
}

export interface RuleMatch {
  rule: WorkspaceRule;
  pattern: string;
}

/** Every rule a path falls under, with the first of its patterns that matched. */
export function matchRules(rules: readonly WorkspaceRule[], path: string): RuleMatch[] {
  const out: RuleMatch[] = [];
  for (const rule of rules) {
    const pattern = rule.paths.find((p) => matchesPattern(p, path));
    if (pattern) out.push({ rule, pattern });
  }
  return out;
}

/** A new rule's id, unused in the set. */
export function nextRuleId(rules: readonly Pick<WorkspaceRule, "id">[]): string {
  const used = new Set(rules.map((r) => r.id));
  let n = rules.length + 1;
  while (used.has(`r${n}`)) n++;
  return `r${n}`;
}
