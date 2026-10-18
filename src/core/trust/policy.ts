/**
 * The policy engine (ADR 0004): typed TypeScript rules behind one function,
 * returning one of the six outcomes. The rule set is versioned and hashed
 * with the same canonical JSON as approvals, and every decision records
 * that hash, so a decision can be traced to the exact rules that made it.
 *
 * Version 1 governs change proposals at autonomy level 0, where every
 * change needs a person's approval:
 * - Any contract violation: BLOCK.
 * - Sensitive files (dependencies, CI, database migrations, infrastructure,
 *   auth and security code) or a large change: ESCALATE, meaning an owner
 *   or admin must approve.
 * - Anything else: REQUIRE_APPROVAL, meaning any contributor may approve.
 */
import type { PolicyOutcome } from "../billing/usage";
import { canonicalHash } from "./canonical-json";

export interface PolicyFinding {
  rule: string;
  outcome: PolicyOutcome;
  detail: string;
}

export interface PolicyDecision {
  outcome: PolicyOutcome;
  findings: PolicyFinding[];
  /** sha256 of the rule set that decided. */
  policyVersion: string;
}

export interface ChangePolicyInput {
  files: readonly { path: string; kind: "create" | "edit" }[];
  contractViolations: readonly { kind: string; detail: string }[];
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

/** More files than this in one change needs an owner or admin. */
export const LARGE_CHANGE_FILES = 10;

/** The rule set, as data. Its canonical hash is the policy version. */
export const CHANGE_POLICY_RULES = {
  schema: "farbaek.policy/v1",
  scope: "change_proposal",
  autonomyLevel: 0,
  contractViolation: "BLOCK",
  sensitive: SENSITIVE.map((s) => ({ rule: s.rule, pattern: s.pattern.source, outcome: "ESCALATE" })),
  largeChange: { files: LARGE_CHANGE_FILES, outcome: "ESCALATE" },
  otherwise: "REQUIRE_APPROVAL",
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
  if (input.files.length > LARGE_CHANGE_FILES) {
    findings.push({ rule: "large_change", outcome: "ESCALATE", detail: `${input.files.length} files change, more than ${LARGE_CHANGE_FILES}.` });
  }
  // Autonomy level 0: nothing is allowed without a person, so the floor is REQUIRE_APPROVAL.
  const outcome = findings.reduce<PolicyOutcome>((worst, f) => (RANK[f.outcome] > RANK[worst] ? f.outcome : worst), "REQUIRE_APPROVAL");
  return { outcome, findings, policyVersion: await changePolicyVersion() };
}

export const OUTCOME_LABELS: Record<PolicyOutcome, string> = {
  ALLOW: "Allowed",
  ALLOW_WITHIN_LIMITS: "Allowed within limits",
  REQUIRE_APPROVAL: "Needs a contributor's approval",
  SIMULATE_FIRST: "Needs a simulation first",
  ESCALATE: "Needs an owner or admin to approve",
  BLOCK: "Blocked",
};
