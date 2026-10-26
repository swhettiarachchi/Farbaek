/**
 * What the policy builder shows next to each draft rule (ADR 0082), worked
 * out by Farbaek's code from the rules and the workspace's own files: the
 * files a rule matches, and flags for what deserves a second look. Flags
 * never stop activation; invalid patterns do (parseRuleSet).
 */
import { builtInRuleFor } from "./policy";
import { compilePattern, coversEverything } from "./path-pattern";
import { EFFECTS, matchRules, type WorkspaceRule } from "./workspace-rules";

export type RuleFlagKind = "no_match" | "everything" | "built_in" | "overlap" | "duplicate";

export interface RuleFlag {
  rule: string;
  kind: RuleFlagKind;
  /** A warning asks for a second look; a note explains. */
  tone: "warning" | "note";
  text: string;
}

export interface RuleExamples {
  rule: string;
  /** Matching files, at most five, as "project/path" only when there are several projects. */
  files: string[];
  count: number;
}

export interface ProjectPath {
  project: string;
  path: string;
}

const SHOWN = 5;

/** Only valid patterns take part: invalid ones already carry their own error. */
const valid = (rule: WorkspaceRule): WorkspaceRule => ({ ...rule, paths: rule.paths.filter((p) => compilePattern(p).ok) });

export function ruleExamples(rules: readonly WorkspaceRule[], files: readonly ProjectPath[]): RuleExamples[] {
  const projects = new Set(files.map((f) => f.project)).size;
  return rules.map((r) => {
    const rule = valid(r);
    const hits = files.filter((f) => matchRules([rule], f.path).length > 0);
    return { rule: r.id, files: hits.slice(0, SHOWN).map((f) => (projects > 1 ? `${f.project}: ${f.path}` : f.path)), count: hits.length };
  });
}

export function ruleFlags(rules: readonly WorkspaceRule[], files: readonly ProjectPath[]): RuleFlag[] {
  const flags: RuleFlag[] = [];
  const seen = new Map<string, string>();
  for (const r of rules) {
    const rule = valid(r);
    for (const p of rule.paths) {
      const before = seen.get(p);
      if (before) flags.push({ rule: r.id, kind: "duplicate", tone: "note", text: `${p} is listed ${before === r.id ? "twice in this rule" : "in another rule too"}.` });
      else seen.set(p, r.id);

      if (coversEverything(p)) {
        flags.push({
          rule: r.id,
          kind: "everything",
          tone: "warning",
          text: r.effect === "block" ? `${p} covers every file, so every change would be stopped.` : `${p} covers every file, so every change ${EFFECTS[r.effect].sentence}.`,
        });
      } else if (files.length > 0 && !files.some((f) => matchRules([{ ...rule, paths: [p] }], f.path).length > 0)) {
        flags.push({ rule: r.id, kind: "no_match", tone: "warning", text: `${p} matches no file in your projects yet. Check the spelling, or keep it for files you'll add.` });
      }
    }

    // A rule that asks for no more than the built-in policy already does.
    if (r.effect !== "block") {
      const hits = files.filter((f) => matchRules([rule], f.path).length > 0);
      if (hits.length > 0 && hits.every((f) => builtInRuleFor(f.path) !== null)) {
        flags.push({
          rule: r.id,
          kind: "built_in",
          tone: "note",
          text: `Every file it matches already needs an owner or admin under the built-in policy${r.effect === "person_approval" ? ", which is stricter than this rule" : ""}. It still applies to files added later.`,
        });
      }
    }
  }

  // Two rules with different effects on the same file: the stricter one decides.
  rules.forEach((first, i) => {
    for (const second of rules.slice(i + 1)) {
      const a = valid(first);
      const b = valid(second);
      if (a.effect === b.effect) continue;
      const both = files.find((f) => matchRules([a], f.path).length > 0 && matchRules([b], f.path).length > 0);
      if (!both) continue;
      const strict = EFFECTS[a.effect].rank >= EFFECTS[b.effect].rank ? a : b;
      flags.push({ rule: b.id, kind: "overlap", tone: "note", text: `${both.path} matches this rule and another one. The stricter applies: ${EFFECTS[strict.effect].label.toLowerCase()}.` });
    }
  });
  return flags;
}
