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

/** A workspace's autonomy at level 2 (ADR 0046); null or absent means level 0. */
export interface AutonomyLimits {
  level: 2;
  maxFiles: number;
  allowCreates: boolean;
}

export interface ChangePolicyInput {
  files: readonly { path: string; kind: "create" | "edit" }[];
  contractViolations: readonly { kind: string; detail: string }[];
  autonomy?: AutonomyLimits | null;
  /** The contract lists checks and a verified sandbox can run them once the change applies. */
  verifiable?: boolean;
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
  schema: "farbaek.policy/v2",
  scope: "change_proposal",
  contractViolation: "BLOCK",
  sensitive: SENSITIVE.map((s) => ({ rule: s.rule, pattern: s.pattern.source, outcome: "ESCALATE" })),
  largeChange: { files: LARGE_CHANGE_FILES, outcome: "ESCALATE" },
  otherwise: "REQUIRE_APPROVAL",
  autonomy: {
    level: 2,
    outcome: "ALLOW_WITHIN_LIMITS",
    onlyFrom: "REQUIRE_APPROVAL",
    requires: ["files within the workspace's limit", "no new files unless the workspace allows them", "checks a verified sandbox can run"],
  },
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
  // Without autonomy nothing is allowed without a person, so the floor is REQUIRE_APPROVAL.
  let outcome = findings.reduce<PolicyOutcome>((worst, f) => (RANK[f.outcome] > RANK[worst] ? f.outcome : worst), "REQUIRE_APPROVAL");
  // Level 2 only ever lowers REQUIRE_APPROVAL, and only when every limit holds.
  if (input.autonomy?.level === 2 && outcome === "REQUIRE_APPROVAL") {
    const limits = input.autonomy;
    const creates = input.files.filter((f) => f.kind === "create").length;
    const unmet = [
      input.files.length > limits.maxFiles ? `it changes ${input.files.length} files, more than the limit of ${limits.maxFiles}` : null,
      creates > 0 && !limits.allowCreates ? `it creates ${creates === 1 ? "a new file" : `${creates} new files`}, which this workspace doesn't allow on their own` : null,
      input.verifiable ? null : "nothing could check it: the contract lists no checks, or no verified sandbox is connected",
    ].filter((x): x is string => x !== null);
    if (unmet.length === 0) {
      outcome = "ALLOW_WITHIN_LIMITS";
      findings.push({ rule: "autonomy", outcome, detail: `Within this workspace's autonomy limits (level 2): ${input.files.length} ${input.files.length === 1 ? "file" : "files"}, inside the contract, no sensitive files, and its checks can run in a verified sandbox.` });
    } else {
      findings.push({ rule: "autonomy", outcome: "REQUIRE_APPROVAL", detail: `Autonomy level 2 is on, but this waits for a person: ${unmet.join("; ")}.` });
    }
  }
  return { outcome, findings, policyVersion: await changePolicyVersion() };
}

export const OUTCOME_LABELS: Record<PolicyOutcome, string> = {
  ALLOW: "Allowed",
  ALLOW_WITHIN_LIMITS: "Applies on its own within this workspace's limits",
  REQUIRE_APPROVAL: "Needs a contributor's approval",
  SIMULATE_FIRST: "Needs a simulation first",
  ESCALATE: "Needs an owner or admin to approve",
  BLOCK: "Blocked",
};
