/**
 * Runs a security check on a project (ADR 0024). Three checks, each
 * reported as run or skipped with the reason:
 *
 * 1. Farbaek's rules over every file (always; no code runs).
 * 2. Known vulnerabilities in npm packages: `npm audit` against the lockfile,
 *    in a sandbox with registry-only network, when one is connected.
 *    Every lockfile is also looked up in OSV.dev (ADR 0130), and Semgrep with
 *    Farbaek's rules and detect-secrets run in a sandbox (ADR 0137).
 * 3. An AI review of the riskiest files, metered from the wallet (operation
 *    security_review), when AI is connected and there's usage left.
 *
 * Plans without full checks get a rules check (ADR 0168): the rules and the
 * OSV.dev lookup, with the sandbox scans and the AI review skipped for the plan.
 *
 * The result is a report statement with its digest. Checks run in this
 * server process and report when done; one that never finishes is failed
 * when someone next looks.
 */
import { checkFeature } from "@/core/billing/entitlements";
import { routeModel } from "@/server/ai/routing";
import { approxTokens, reserveUnits } from "@/core/billing/rate-card";
import { parseNpmAudit } from "@/core/security/audit";
import { lockfilePackages, osvFindings } from "@/core/security/osv";
import { parseSecrets, parseSemgrep, withoutRepeats } from "@/core/security/static-scan";
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
import type { OsvLookup } from "./osv-client";
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
  /** Looks locked versions up in OSV.dev (ADR 0130); absent in older callers, which skip the check. */
  osv?: OsvLookup;
  /** Runs Semgrep and detect-secrets in a sandbox and returns each tool's compacted report (ADR 0137). */
  staticScan?: ((input: { projectId: string; reportId: string }) => Promise<{ ok: true; semgrep: string; secrets: string } | { ok: false; reason: string }>) | { unavailable: string };
}

export interface CheckPerson {
  orgId: string;
  userId: string;
  role: OrgRole;
}

/**
 * What a check runs (ADR 0168). Every plan gets the rules check: Farbaek's
 * rules and the OSV.dev lookup, which cost nothing to run, so any site can be
 * published. The sandbox scans and the AI review come with the full check.
 */
export type SecurityCheckScope = { kind: "full" } | { kind: "rules"; reason: string };

export const FULL_CHECK_REASON = "Included from the Plus plan up, and in the trial.";

/** The scope a plan gets, or null when the plan can't be read. */
export function checkScope(plan: Parameters<typeof checkFeature>[0]): SecurityCheckScope | null {
  const feature = checkFeature(plan, "security_checks");
  if (feature.allowed) return { kind: "full" };
  if (feature.code === "FEATURE_NOT_IN_PLAN") return { kind: "rules", reason: FULL_CHECK_REASON };
  if (feature.code === "BILLING_SUSPENDED") return { kind: "rules", reason: feature.message };
  return null;
}

export async function startSecurityCheck(deps: SecurityCheckDeps, person: CheckPerson, projectId: string): Promise<WriteResult<{ reportId: string }>> {
  if (!CONTRIBUTOR_ROLES.includes(person.role)) return fail("FORBIDDEN");
  const billing = await resolvePlan(deps.usage, person.orgId);
  if (!billing.ok) return billing;
  const scope = checkScope(billing.value.plan);
  if (!scope) return fail("ENTITLEMENT_UNAVAILABLE");
  const project = await deps.checks.project(person.orgId, projectId);
  if (!project) return fail("NOT_FOUND");
  if (project.archived) return fail("PROJECT_ARCHIVED");

  const started = await deps.reports.start({ orgId: person.orgId, actor: person.userId, projectId });
  if (!started.ok) {
    if (started.error.includes("CHECK_RUNNING")) return fail("INVALID_TRANSITION", "A security check is already running on this project.");
    return fail(codeFromDatabaseError(started.error));
  }
  const reportId = started.value;
  void runSecurityCheck(deps, person, { id: project.id, name: project.name }, reportId, scope).catch((e) => {
    log("error", "security.check_crashed", { report: reportId, error: e instanceof Error ? e.message : String(e) });
  });
  return { ok: true, value: { reportId } };
}

/** Runs the checks and records the report. Exported for tests; startSecurityCheck runs it in the background. */
export async function runSecurityCheck(
  deps: SecurityCheckDeps,
  person: CheckPerson,
  project: { id: string; name: string },
  reportId: string,
  scope: SecurityCheckScope = { kind: "full" },
): Promise<void> {
  const full = scope.kind === "full";
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
    if (!full) {
      checks.push({ name: "dependencies", ran: false, reason: scope.reason });
    } else if (!files.some((f) => f.path === "package-lock.json")) {
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

    // 2b. Every lockfile, in OSV.dev (ADR 0130). npm packages npm audit already checked aren't counted twice.
    const auditRan = checks.some((c) => c.name === "dependencies" && c.ran);
    const locked = lockfilePackages(files);
    const lookFor = locked.packages.filter((p) => !(auditRan && p.ecosystem === "npm"));
    if (locked.lockfiles.length === 0) {
      checks.push({ name: "osv", ran: false, reason: "This project has no lockfile (package-lock.json, pnpm-lock.yaml, yarn.lock, requirements.txt or poetry.lock), so exact versions aren't known." });
    } else if (!deps.osv) {
      checks.push({ name: "osv", ran: false, reason: "OSV.dev isn't connected on this server." });
    } else if (lookFor.length === 0) {
      checks.push({ name: "osv", ran: false, reason: auditRan ? "npm audit already checked every locked package." : "The lockfiles pin no exact versions Farbaek can read." });
    } else {
      const looked = await deps.osv(lookFor);
      if (looked.ok) {
        const found = osvFindings(looked.hits, looked.details);
        findings.push(...found);
        const skipped = auditRan ? " npm packages were left to npm audit." : "";
        checks.push({ name: "osv", ran: true, findings: found.length, detail: `${lookFor.length} locked ${lookFor.length === 1 ? "package" : "packages"} from ${locked.lockfiles.join(", ")} looked up; ${looked.hits.length} with known vulnerabilities.${locked.capped ? " Only the first 3,000 were looked up." : ""}${skipped}` });
      } else {
        checks.push({ name: "osv", ran: false, reason: looked.reason });
      }
    }

    // 2c. Semgrep and detect-secrets, in a sandbox (ADR 0137). A problem another check already reported at the same line isn't counted twice.
    if (!full) {
      checks.push({ name: "sast", ran: false, reason: scope.reason }, { name: "secrets", ran: false, reason: scope.reason });
    } else if (!deps.staticScan || "unavailable" in deps.staticScan) {
      const reason = deps.staticScan && "unavailable" in deps.staticScan ? deps.staticScan.unavailable : "Static analysis isn't connected on this server.";
      checks.push({ name: "sast", ran: false, reason }, { name: "secrets", ran: false, reason });
    } else {
      const scanned = await deps.staticScan({ projectId: project.id, reportId });
      if (!scanned.ok) {
        checks.push({ name: "sast", ran: false, reason: scanned.reason }, { name: "secrets", ran: false, reason: scanned.reason });
      } else {
        for (const [name, parsed] of [
          ["sast", parseSemgrep(scanned.semgrep)],
          ["secrets", parseSecrets(scanned.secrets)],
        ] as const) {
          if (!parsed.ok) {
            checks.push({ name, ran: false, reason: parsed.reason });
            continue;
          }
          const fresh = withoutRepeats(findings, parsed.findings);
          findings.push(...fresh);
          const capped = parsed.total > parsed.findings.length ? ` Only the first ${parsed.findings.length} of ${parsed.total} are listed.` : "";
          checks.push({ name, ran: true, findings: fresh.length, detail: `${parsed.detail}${capped}` });
        }
      }
    }

    // 3. The AI review.
    let model: string | null = null;
    if (!full) {
      checks.push({ name: "ai_review", ran: false, reason: scope.reason });
    } else if ("unavailable" in deps.reviewer) {
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

    const statement = buildSecurityReport({ project, files: files.length, snapshotDigest, checks, findings, model, generatedAt: deps.usage.now(), rulesOnly: !full });
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
  const reviewer = source.create(routeModel({ plan: billing.value.plan, family: source.family, step: "review", effort: "balanced" }));
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
