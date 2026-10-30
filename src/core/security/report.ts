/**
 * A security check's report as an in-toto statement (ADR 0024): what was
 * checked (the project's files by their digest), which checks ran or were
 * skipped and why, every finding, and the score. Its digest is the SHA-256
 * of the RFC 8785 canonical JSON, like a ProofPack's, so a report can be
 * checked later for tampering.
 */
import { canonicalHash } from "../trust/canonical-json";
import { IN_TOTO_STATEMENT_TYPE } from "../proof/proofpack";
import { countBySeverity, dedupeFindings, scoreOf, sortFindings, type Finding, type Grade, type Severity } from "./findings";

export const SECURITY_REPORT_PREDICATE_TYPE = "https://farbaek.dev/security-report/v1";

export type CheckName = "rules" | "dependencies" | "osv" | "sast" | "secrets" | "ai_review";

export const CHECK_LABELS: Record<CheckName, string> = {
  rules: "Farbaek's security rules",
  dependencies: "Known vulnerabilities in packages",
  osv: "Known vulnerabilities from OSV.dev",
  sast: "Semgrep with Farbaek's rules",
  secrets: "Secrets in the code (detect-secrets)",
  ai_review: "AI review of the riskiest files",
};

export type CheckOutcome = { name: CheckName; ran: true; findings: number; detail?: string } | { name: CheckName; ran: false; reason: string };

export interface SecurityReportStatement {
  _type: typeof IN_TOTO_STATEMENT_TYPE;
  subject: { name: string; digest: { sha256: string } }[];
  predicateType: typeof SECURITY_REPORT_PREDICATE_TYPE;
  predicate: {
    project: { id: string; name: string; files: number };
    score: number;
    grade: Grade;
    counts: Record<Severity, number>;
    checks: CheckOutcome[];
    findings: Finding[];
    model: string | null;
    generatedAt: string;
  };
}

export function buildSecurityReport(input: {
  project: { id: string; name: string };
  files: number;
  snapshotDigest: string;
  checks: CheckOutcome[];
  findings: Finding[];
  model: string | null;
  generatedAt: Date;
}): SecurityReportStatement {
  // Stable ids, most serious first, so "Fix with the agent" can name a finding.
  const findings = sortFindings(dedupeFindings(input.findings)).map((f, i) => ({ ...f, id: `F${String(i + 1).padStart(3, "0")}` }));
  const { score, grade } = scoreOf(findings);
  return {
    _type: IN_TOTO_STATEMENT_TYPE,
    subject: [{ name: `project:${input.project.id}`, digest: { sha256: input.snapshotDigest } }],
    predicateType: SECURITY_REPORT_PREDICATE_TYPE,
    predicate: {
      project: { id: input.project.id, name: input.project.name, files: input.files },
      score,
      grade,
      counts: countBySeverity(findings),
      checks: input.checks,
      findings,
      model: input.model,
      generatedAt: input.generatedAt.toISOString(),
    },
  };
}

export function securityReportDigest(statement: SecurityReportStatement): Promise<string> {
  return canonicalHash(statement);
}
