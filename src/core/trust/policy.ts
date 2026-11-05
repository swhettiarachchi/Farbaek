/**
 * The policy engine (ADR 0004): typed TypeScript rules behind one function,
 * returning one of the six outcomes. The rule set is versioned and hashed
 * with the same canonical JSON as approvals, and every decision records
 * that hash, so a decision can be traced to the exact rules that made it.
 *
 * Version 2 governs change proposals:
 * - Any contract violation: BLOCK.
 * - Sensitive files (dependencies, CI, database migrations, infrastructure,
 *   auth and security code) or a large change: ESCALATE, meaning an owner
 *   or admin must approve.
 * - Anything else: REQUIRE_APPROVAL, meaning any contributor may approve.
 * - Autonomy level 2 (ADR 0046), when the workspace turned it on: a change
 *   that would only need a contributor applies on its own
 *   (ALLOW_WITHIN_LIMITS) if it stays within the file limit, creates no
 *   files unless allowed, and has checks a verified sandbox can run.
 *   Autonomy never lowers a BLOCK or an ESCALATE.
 * - Autonomy level 3 (ADR 0086): the same rules with wider limits (up to
 *   10 files) and a daily budget of changes applied on their own; once it's
 *   spent, changes wait for a person.
 * - Workspace rules (ADR 0082), version 3: a workspace's own rules add a
 *   BLOCK, an ESCALATE, or a REQUIRE_APPROVAL that level 2 never lowers,
 *   for the files they name. They only ever make a change stricter.
 * - Shadow mode (ADR 0075), when the workspace rehearses level 2: every
 *   change still waits for a person, and the decision records what level 2
 *   would have done, with its reasons. The rehearsal never changes the
 *   outcome, so the rule set (and its version) is the same.
 */
import type { PolicyOutcome } from "../billing/usage";
import { canonicalHash } from "./canonical-json";
import { EFFECTS, matchRules, type ActiveRules } from "./workspace-rules";

export interface PolicyFinding {
  rule: string;
  outcome: PolicyOutcome;
  detail: string;
}

/** Why level 2 would still have waited for a person. */
export type RehearsalReason = "blocked" | "escalated" | "too_many_files" | "creates_files" | "not_verifiable" | "workspace_rule" | "daily_limit";

/** What level 2 would have decided, recorded in shadow mode only (ADR 0075). Never acted on. */
export interface ShadowDecision {
  outcome: "ALLOW_WITHIN_LIMITS" | "REQUIRE_APPROVAL";
  reasons: RehearsalReason[];
  detail: string;
  maxFiles: number;
  allowCreates: boolean;
}

export interface PolicyDecision {
  outcome: PolicyOutcome;
  findings: PolicyFinding[];
  /** sha256 of the rule set that decided. */
  policyVersion: string;
  /** Present only while the workspace rehearses level 2. */
  shadow?: ShadowDecision;
  /** The workspace rules that applied (ADR 0082), when the workspace has any. */
  workspaceRules?: { version: number; sha256: string };
  /** The autonomy level that let it apply on its own; only with ALLOW_WITHIN_LIMITS. */
  autonomyLevel?: 2 | 3;
}

/**
 * A workspace's autonomy at level 2 (ADR 0046); null or absent means level 0.
 * With `rehearsal`, the workspace is in shadow mode (ADR 0075): these limits
 * are only rehearsed, and every change still waits for a person.
 */
export interface AutonomyLimits {
  level: 2 | 3;
  maxFiles: number;
  allowCreates: boolean;
  rehearsal?: boolean;
  /** Level 3 only (ADR 0086): changes it may still apply on its own in the last 24 hours. */
  dailyLeft?: number | null;
}

export interface ChangePolicyInput {
  files: readonly { path: string; kind: "create" | "edit" }[];
  contractViolations: readonly { kind: string; detail: string }[];
  autonomy?: AutonomyLimits | null;
  /** The contract lists checks and a verified sandbox can run them once the change applies. */
  verifiable?: boolean;
  /** The workspace's active rules (ADR 0082), or null when it has none. Required, so no caller can leave them out. */
  rules: ActiveRules | null;
}

const SENSITIVE: readonly { rule: string; pattern: RegExp; why: string }[] = [
  {
    rule: "dependencies",
    pattern: /(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|requirements\.txt|poetry\.lock|pyproject\.toml|go\.mod|go\.sum|Cargo\.toml|Cargo\.lock|Gemfile(\.lock)?|composer\.(json|lock))$/,
    why: "changes dependencies",
  },
  { rule: "ci_workflows", pattern: /(^\.github\/workflows\/|(^|\/)(\.gitlab-ci\.ya?ml|Jenkinsfile|azure-pipelines\.ya?ml|\.circleci\/config\.ya?ml)$)/, why: "changes CI workflows" },
  { rule: "database_migrations", pattern: /((^|\/)migrations?\/|\.sql$)/, why: "changes the database schema" },
  {
    rule: "infrastructure",
    pattern: /(^|\/)(Dockerfile|docker-compose\.ya?ml|compose\.ya?ml|vercel\.json|netlify\.toml|fly\.toml|wrangler\.toml|[^/]+\.tf|next\.config\.(js|mjs|ts))$/,
    why: "changes deployment or infrastructure",
  },
  {
    rule: "auth_and_security",
    // Whole name parts only: "src/auth/x.ts" and "permissions.ts" match, "authoring.md" doesn't.
    pattern: /((^|\/)(middleware|proxy)\.(ts|js|mjs)$|(^|[/._-])(auth|oauth|security|permissions?|sessions?|crypto)([/._-]|$))/i,
    why: "touches authentication or security code",
  },
];

/** What the built-in rules escalate, in words, for the Policies page. */
export const SENSITIVE_WORDS: readonly string[] = SENSITIVE.map((s) => s.why);

/** More files than this in one change needs an owner or admin. */
export const LARGE_CHANGE_FILES = 10;

/** The rule set, as data. Its canonical hash is the policy version. */
export const CHANGE_POLICY_RULES = {
  schema: "farbaek.policy/v3",
  scope: "change_proposal",
  contractViolation: "BLOCK",
  sensitive: SENSITIVE.map((s) => ({ rule: s.rule, pattern: s.pattern.source, outcome: "ESCALATE" })),
  largeChange: { files: LARGE_CHANGE_FILES, outcome: "ESCALATE" },
  otherwise: "REQUIRE_APPROVAL",
  autonomy: {
    level: 2,
    outcome: "ALLOW_WITHIN_LIMITS",
    onlyFrom: "REQUIRE_APPROVAL",
    requires: ["files within the workspace's limit", "no new files unless the workspace allows them", "checks a verified sandbox can run", "no workspace rule that holds it for a person"],
  },
  workspaceRules: { block: "BLOCK", owner_approval: "ESCALATE", person_approval: "REQUIRE_APPROVAL", onlyStricter: true },
  levelThree: { maxFiles: 10, dailyBudget: true, earned: "10 changes applied on their own verified in 30 days, none failed" },
} as const;

let versionPromise: Promise<string> | null = null;
export function changePolicyVersion(): Promise<string> {
  versionPromise ??= canonicalHash(CHANGE_POLICY_RULES);
  return versionPromise;
}

const RANK: Record<PolicyOutcome, number> = { ALLOW: 0, ALLOW_WITHIN_LIMITS: 1, SIMULATE_FIRST: 2, REQUIRE_APPROVAL: 3, ESCALATE: 4, BLOCK: 5 };

export async function evaluateChangePolicy(input: ChangePolicyInput): Promise<PolicyDecision> {
  const findings: PolicyFinding[] = [];
  for (const v of input.contractViolations) findings.push({ rule: "contract", outcome: "BLOCK", detail: v.detail });
  for (const f of input.files) {
    for (const s of SENSITIVE) {
      if (s.pattern.test(f.path)) findings.push({ rule: s.rule, outcome: "ESCALATE", detail: `${f.path} ${s.why}.` });
    }
  }
  const ruleSet = input.rules && input.rules.rules.length > 0 ? input.rules : null;
  if (ruleSet) {
    for (const f of input.files) {
      for (const m of matchRules(ruleSet.rules, f.path)) {
        findings.push({ rule: `workspace:${m.rule.id}`, outcome: EFFECTS[m.rule.effect].outcome, detail: `${f.path} matches ${m.pattern}, a workspace rule (version ${ruleSet.version}): ${m.rule.reason}` });
      }
    }
  }
  if (input.files.length > LARGE_CHANGE_FILES) {
    findings.push({ rule: "large_change", outcome: "ESCALATE", detail: `${input.files.length} files change, more than ${LARGE_CHANGE_FILES}.` });
  }
  // Without autonomy nothing is allowed without a person, so the floor is REQUIRE_APPROVAL.
  let outcome = findings.reduce<PolicyOutcome>((worst, f) => (RANK[f.outcome] > RANK[worst] ? f.outcome : worst), "REQUIRE_APPROVAL");
  const limits = input.autonomy?.level === 2 || input.autonomy?.level === 3 ? input.autonomy : null;
  const held = findings.some((f) => f.rule.startsWith("workspace:") && f.outcome === "REQUIRE_APPROVAL");
  const unmet = limits ? unmetLimits(input, limits, held) : [];
  const applied = ruleSet ? { workspaceRules: { version: ruleSet.version, sha256: ruleSet.sha256 } } : {};

  // In shadow mode, record what level 2 would have done and change nothing.
  if (limits?.rehearsal) {
    const shadow = rehearse(outcome, unmet, input.files.length, limits);
    return { outcome, findings, policyVersion: await changePolicyVersion(), shadow, ...applied };
  }
  // Level 2 only ever lowers REQUIRE_APPROVAL, and only when every limit holds.
  if (limits && outcome === "REQUIRE_APPROVAL") {
    if (unmet.length === 0) {
      outcome = "ALLOW_WITHIN_LIMITS";
      findings.push({ rule: "autonomy", outcome, detail: `Within this workspace's autonomy limits (level ${limits.level}): ${input.files.length} ${input.files.length === 1 ? "file" : "files"}, inside the contract, no sensitive files, and its checks can run in a verified sandbox.` });
      return { outcome, findings, policyVersion: await changePolicyVersion(), ...applied, autonomyLevel: limits.level };
    } else {
      findings.push({ rule: "autonomy", outcome: "REQUIRE_APPROVAL", detail: `Autonomy level ${limits.level} is on, but this waits for a person: ${unmet.map((u) => u.text).join("; ")}.` });
    }
  }
  return { outcome, findings, policyVersion: await changePolicyVersion(), ...applied };
}

function unmetLimits(input: ChangePolicyInput, limits: AutonomyLimits, held: boolean): { reason: RehearsalReason; text: string }[] {
  const creates = input.files.filter((f) => f.kind === "create").length;
  const unmet: { reason: RehearsalReason; text: string }[] = [];
  if (input.files.length > limits.maxFiles) unmet.push({ reason: "too_many_files", text: `it changes ${input.files.length} files, more than the limit of ${limits.maxFiles}` });
  if (creates > 0 && !limits.allowCreates)
    unmet.push({ reason: "creates_files", text: `it creates ${creates === 1 ? "a new file" : `${creates} new files`}, which this workspace doesn't allow on their own` });
  if (!input.verifiable) unmet.push({ reason: "not_verifiable", text: "nothing could check it: the contract lists no checks, or no verified sandbox is connected" });
  if (held) unmet.push({ reason: "workspace_rule", text: "a workspace rule says a person always reviews these files" });
  if (limits.level === 3 && limits.dailyLeft === 0) unmet.push({ reason: "daily_limit", text: "the workspace reached its daily limit of changes applied on their own" });
  return unmet;
}

function rehearse(outcome: PolicyOutcome, unmet: { reason: RehearsalReason; text: string }[], files: number, limits: AutonomyLimits): ShadowDecision {
  const base = { maxFiles: limits.maxFiles, allowCreates: limits.allowCreates };
  if (outcome === "BLOCK" || outcome === "ESCALATE") {
    const blocked = outcome === "BLOCK";
    return {
      ...base,
      outcome: "REQUIRE_APPROVAL",
      reasons: [blocked ? "blocked" : "escalated"],
      detail: `Level 2 would still have waited: the policy ${blocked ? "blocks" : "escalates"} this change, and autonomy never lowers that.`,
    };
  }
  if (unmet.length > 0) {
    return { ...base, outcome: "REQUIRE_APPROVAL", reasons: unmet.map((u) => u.reason), detail: `Level 2 would still have waited for a person: ${unmet.map((u) => u.text).join("; ")}.` };
  }
  return {
    ...base,
    outcome: "ALLOW_WITHIN_LIMITS",
    reasons: [],
    detail: `Level 2 would have applied this on its own: ${files} ${files === 1 ? "file" : "files"}, inside the contract, no sensitive files, and its checks can run in a verified sandbox.`,
  };
}

/** The decision as stored with a proposal; the rehearsal goes with it only in shadow mode, the workspace rules only when there are some. */
export function policyRecord(decision: PolicyDecision) {
  return {
    outcome: decision.outcome,
    version: decision.policyVersion,
    findings: decision.findings,
    ...(decision.shadow ? { shadow: decision.shadow } : {}),
    ...(decision.workspaceRules ? { workspaceRules: decision.workspaceRules } : {}),
    ...(decision.autonomyLevel ? { autonomyLevel: decision.autonomyLevel } : {}),
  };
}

/** The built-in rule that already escalates a path, or null. */
export function builtInRuleFor(path: string): { rule: string; why: string } | null {
  const s = SENSITIVE.find((x) => x.pattern.test(path));
  return s ? { rule: s.rule, why: s.why } : null;
}

export const OUTCOME_LABELS: Record<PolicyOutcome, string> = {
  ALLOW: "Allowed",
  ALLOW_WITHIN_LIMITS: "Applies on its own within this workspace's limits",
  REQUIRE_APPROVAL: "Needs a person's approval",
  SIMULATE_FIRST: "Needs a trial first",
  ESCALATE: "Needs an owner or admin to approve",
  BLOCK: "Blocked",
};
