/**
 * Runs a security check on a project (ADR 0024). Three checks, each
 * reported as run or skipped with the reason:
 *
 * 1. Farbaek's rules over every file (always; no code runs).
 * 2. Known vulnerabilities in npm packages: `npm audit` against the lockfile,
 *    in a sandbox with registry-only network, when one is connected.
 * 3. An AI review of the riskiest files, metered from the wallet (operation
 *    security_review), when AI is connected and there's usage left.
 *
 * The result is a report statement with its digest. Checks run in this
 * server process and report when done; one that never finishes is failed
 * when someone next looks.
 */
import { checkFeature } from "@/core/billing/entitlements";
import { route } from "@/core/agent/routing";
import { approxTokens, reserveUnits } from "@/core/billing/rate-card";
import { parseNpmAudit } from "@/core/security/audit";
import type { Finding } from "@/core/security/findings";
import { buildSecurityReport, securityReportDigest, type CheckOutcome } from "@/core/security/report";
import { riskiestFiles, runRules, type ProjectFile } from "@/core/security/rules";
import { canonicalHash } from "@/core/trust/canonical-json";
import type { AgentStore } from "@/server/agent/service";
import { SECURITY_REVIEW_SYSTEM_PROMPT, reviewMessage, type SecurityReviewer } from "@/server/ai/security-reviewer";
import { log } from "@/server/observability/log";
import { refundUsage, reserveUsage, resolvePlan, settleUsage, type AiUsageDeps, type ModelSource, type UsageContext } from "@/server/workspace/ai-usage";
import { CONTRIBUTOR_ROLES, type OrgRole } from "@/server/workspace/types";
import { codeFromDatabaseError, fail, type WriteResult } from "@/server/workspace/use-cases";
import type { SecurityReportStore } from "./store";

/** How long a check may run before it counts as stopped. */
export const SECURITY_CHECK_MAX_MINUTES = 15;
const MAX_FILES = 3_000;
const MAX_FILE_BYTES = 512 * 1024;
const REVIEW_FILES = 8;

export interface SecurityCheckDeps {
  reports: SecurityReportStore;
  checks: Pick<AgentStore, "project" | "projectFiles" | "fileContents">;
  usage: UsageContext & AiUsageDeps;
  /** The AI reviewer for the model Auto routing picks, or null with the reason. */
  reviewer: ModelSource<SecurityReviewer> | { unavailable: string };
  /** Runs `npm audit --json` for the project's files in a sandbox, or says why it can't. */
  audit: ((input: { projectId: string; reportId: string; files: ProjectFile[] }) => Promise<{ ok: true; stdout: string } | { ok: false; reason: string }>) | { unavailable: string };
}

export interface CheckPerson {
  orgId: string;
  userId: string;
  role: OrgRole;
}

export async function startSecurityCheck(deps: SecurityCheckDeps, person: CheckPerson, projectId: string): Promise<WriteResult<{ reportId: string }>> {
  if (!CONTRIBUTOR_ROLES.includes(person.role)) return fail("FORBIDDEN");
  const billing = await resolvePlan(deps.usage, person.orgId);
  if (!billing.ok) return billing;
  const feature = checkFeature(billing.value.plan, "security_checks");
  if (!feature.allowed) {
    return fail(feature.code, feature.code === "FEATURE_NOT_IN_PLAN" ? "Security checks are included from the Plus plan up, and in the trial." : feature.message);
  }
  const project = await deps.checks.project(person.orgId, projectId);
  if (!project) return fail("NOT_FOUND");
  if (project.archived) return fail("PROJECT_ARCHIVED");

  const started = await deps.reports.start({ orgId: person.orgId, actor: person.userId, projectId });
  if (!started.ok) {
    if (started.error.includes("CHECK_RUNNING")) return fail("INVALID_TRANSITION", "A security check is already running on this project.");
    return fail(codeFromDatabaseError(started.error));
  }
  const reportId = started.value;
  void runSecurityCheck(deps, person, { id: project.id, name: project.name }, reportId).catch((e) => {
    log("error", "security.check_crashed", { report: reportId, error: e instanceof Error ? e.message : String(e) });
  });
  return { ok: true, value: { reportId } };
}

/** Runs the checks and records the report. Exported for tests; startSecurityCheck runs it in the background. */
export async function runSecurityCheck(deps: SecurityCheckDeps, person: CheckPerson, project: { id: string; name: string }, reportId: string): Promise<void> {
  try {
    const listed = (await deps.checks.projectFiles(person.orgId, project.id)).filter((f) => f.sizeBytes <= MAX_FILE_BYTES).slice(0, MAX_FILES);
    const contents = await deps.checks.fileContents(person.orgId, project.id, listed);
    const files: ProjectFile[] = listed.flatMap((f) => (contents.has(f.path) ? [{ path: f.path, content: contents.get(f.path)! }] : []));
    const snapshotDigest = await canonicalHash(listed.map((f) => ({ path: f.path, sha256: f.sha256 })));

    const checks: CheckOutcome[] = [];
    const findings: Finding[] = [];

    // 1. Farbaek's rules.
    const ruled = runRules(files);
    findings.push(...ruled);
    checks.push({ name: "rules", ran: true, findings: ruled.length });

    // 2. Packages.
    if (!files.some((f) => f.path === "package-lock.json")) {
      checks.push({ name: "dependencies", ran: false, reason: files.some((f) => f.path === "package.json") ? "There's no package-lock.json, so the exact package versions aren't known." : "This project has no npm packages." });
    } else if ("unavailable" in deps.audit) {
      checks.push({ name: "dependencies", ran: false, reason: deps.audit.unavailable });
    } else {
      const ran = await deps.audit({ projectId: project.id, reportId, files });
      const parsed = ran.ok ? parseNpmAudit(ran.stdout) : { ok: false as const, reason: ran.reason };
      if (parsed.ok) {
        findings.push(...parsed.findings);
        checks.push({ name: "dependencies", ran: true, findings: parsed.findings.length, detail: `${parsed.total} vulnerable packages found.` });
      } else {
        checks.push({ name: "dependencies", ran: false, reason: parsed.reason });
      }
    }

    // 3. The AI review.
    let model: string | null = null;
    if ("unavailable" in deps.reviewer) {
      checks.push({ name: "ai_review", ran: false, reason: deps.reviewer.unavailable });
    } else {
      const review = await aiReview(deps, deps.reviewer, person, files, ruled);
      model = review.model;
      if (review.ok) {
        findings.push(...review.findings);
        checks.push({ name: "ai_review", ran: true, findings: review.findings.length, detail: `${review.files} ${review.files === 1 ? "file" : "files"} reviewed.` });
      } else {
        checks.push({ name: "ai_review", ran: false, reason: review.reason });
      }
    }

    const statement = buildSecurityReport({ project, files: files.length, snapshotDigest, checks, findings, model, generatedAt: deps.usage.now() });
    const digest = await securityReportDigest(statement);
    const done = await deps.reports.finish(reportId, { status: "done", statement, digest });
    if (!done.ok) log("error", "security.finish_failed", { report: reportId, error: done.error });
  } catch (e) {
    log("error", "security.check_failed", { report: reportId, error: e instanceof Error ? e.message : String(e) });
    await deps.reports.finish(reportId, { status: "failed", error: "The check stopped because of an error on Farbaek's side. Run it again." }).catch(() => undefined);
  }
}

async function aiReview(
  deps: SecurityCheckDeps,
  source: ModelSource<SecurityReviewer>,
  person: CheckPerson,
  files: ProjectFile[],
  ruled: Finding[],
): Promise<{ ok: true; findings: Finding[]; files: number; model: string } | { ok: false; reason: string; model: string | null }> {
  const chosen = riskiestFiles(files, ruled, REVIEW_FILES);
  if (chosen.length === 0) return { ok: false, reason: "There's no code to review.", model: null };
  const billing = await resolvePlan(deps.usage, person.orgId);
  if (!billing.ok) return { ok: false, reason: billing.message, model: null };
  const reviewer = source.create(route({ plan: billing.value.plan, family: source.family, step: "review", effort: "balanced" }));
  const units = reserveUnits(reviewer.model, approxTokens(SECURITY_REVIEW_SYSTEM_PROMPT) + approxTokens(reviewMessage(chosen)) + 1_500, reviewer.maxOutputTokens);
  const reserved = await reserveUsage(deps.usage, { orgId: person.orgId, userId: person.userId, taskId: null, operation: "security_review", units, manual: "Farbaek's rules and the package audit still ran.", billing: billing.value });
  if (!reserved.ok) return { ok: false, reason: reserved.message, model: reviewer.model };

  let outcome;
  try {
    outcome = await reviewer.review(chosen);
  } catch {
    outcome = { ok: false as const, failure: "PROVIDER_ERROR" as const, usage: null };
  }
  if (!outcome.ok) {
    await refundUsage(deps.usage, { orgId: person.orgId, entryId: reserved.value.entryId, usage: outcome.usage, reason: "failed" });
    return { ok: false, reason: "The AI review didn't finish, so it wasn't counted. Farbaek's rules and the package audit still ran.", model: reviewer.model };
  }
  await settleUsage(deps.usage, { orgId: person.orgId, entryId: reserved.value.entryId, usage: outcome.usage });
  // Model output is untrusted: keep only findings about files it was shown, with a line inside the file.
  const shown = new Map(chosen.map((f) => [f.path, f.content.split("\n").length]));
  const findings: Finding[] = outcome.output.findings
    .filter((f) => shown.has(f.file))
    .map((f) => ({
      id: "",
      rule: "ai-review",
      severity: f.severity,
      source: "ai" as const,
      title: f.title,
      detail: f.detail,
      fix: f.fix,
      file: f.file,
      line: f.line !== null && f.line <= shown.get(f.file)! ? f.line : null,
    }));
  return { ok: true, findings, files: chosen.length, model: outcome.usage.model };
}
