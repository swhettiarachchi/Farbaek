import { ArrowLeftIcon, CheckCircleIcon, CircleDashedIcon, CircleNotchIcon, InfoIcon, WarningIcon, WarningOctagonIcon, WrenchIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { RunSecurityCheck } from "@/components/security/run-check";
import { ScoreRing } from "@/components/security/score-ring";
import { LocalTime } from "@/components/ui/local-time";
import { buttonClasses } from "@/components/ui/button";
import { PLAN_UNCONFIRMED_MESSAGE } from "@/core/billing/entitlements";
import { SEVERITIES, SEVERITY_LABELS, type Finding, type Severity } from "@/core/security/findings";
import { CHECK_LABELS } from "@/core/security/report";
import { shortHash } from "@/core/trust/canonical-json";
import { loadProjectReports } from "@/server/security/page-data";
import { checkScope } from "@/server/security/runner";
import type { SecurityReportView } from "@/server/security/store";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import { fixWithAgentAction } from "./actions";

export const metadata: Metadata = { title: "Security" };

// Severity never relies on colour alone: each has its own icon and label.
const SEVERITY_STYLE: Record<Severity, { icon: Icon; className: string }> = {
  critical: { icon: XCircleIcon, className: "text-failed border-failed/50" },
  high: { icon: WarningOctagonIcon, className: "text-failed border-failed/30" },
  medium: { icon: WarningIcon, className: "text-approval border-approval/40" },
  low: { icon: InfoIcon, className: "text-info border-info/40" },
  info: { icon: CircleDashedIcon, className: "text-ink-3 border-line-strong/50 border-dashed" },
};

const SOURCE_LABEL: Record<Finding["source"], string> = { rules: "Rule", dependencies: "Packages", sast: "Semgrep", secrets: "Secret scan", ai: "AI review" };

function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLE[severity];
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${s.className}`}>
      <s.icon size={14} weight="bold" aria-hidden />
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

type Params = { params: Promise<{ projectId: string }>; searchParams: Promise<{ rescue?: string }> };

export default async function SecurityPage({ params, searchParams }: Params) {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const { projectId } = await params;
  const rescueNotStarted = (await searchParams).rescue === "not_started";
  const project = await ctx.reader.getProject(ctx.current.id, projectId);
  if (!project) notFound();

  const reports: SecurityReportView[] = ctx.mode === "live" ? await loadProjectReports(ctx.current.id, project.id) : [];
  const latest = reports[0] ?? null;
  const running = latest?.status === "running";
  const lastDone = reports.find((r) => r.status === "done" && r.statement) ?? null;

  // Every plan runs at least the rules check (ADR 0168); the full check comes with Plus and the trial.
  const scope = checkScope(ctx.current.billingUnknown ? null : ctx.current.plan);
  const canRun = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const reason = ctx.mode !== "live"
    ? "Security checks need a real workspace."
    : !ctx.writes.enabled
      ? ctx.writes.reason
      : !canRun
        ? "Your role can view reports but not run checks."
        : !scope
          ? PLAN_UNCONFIRMED_MESSAGE
          : project.archivedAt
            ? "This project is archived."
            : null;
  const rulesOnly = scope?.kind === "rules";

  const p = lastDone?.statement?.predicate ?? null;
  const grouped = p ? SEVERITIES.map((s) => ({ severity: s, findings: p.findings.filter((f) => f.severity === s) })).filter((g) => g.findings.length > 0) : [];

  return (
    <div className="grid gap-6">
      <Link href={`/app/projects/${project.id}`} className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-ink-2 hover:text-ink">
        <ArrowLeftIcon size={16} aria-hidden /> {project.name}
      </Link>
      <PageHeader
        title="Security"
        description="Farbaek's rules over every file, known vulnerabilities in your packages, and an AI review of the riskiest code. A guide to what to fix first, not a certification."
        actions={<RunSecurityCheck projectId={project.id} disabledReason={reason} running={running} rulesOnly={rulesOnly} />}
      />

      {rulesOnly ? (
        <Notice>
          On your plan, a check runs Farbaek&apos;s rules over every file and looks your packages up in OSV.dev. That&apos;s enough to publish a site. Package audits, code scanning and the AI review come with{" "}
          <Link href="/pricing" className="font-medium text-accent underline underline-offset-2">
            Plus
          </Link>
          .
        </Notice>
      ) : null}

      {rescueNotStarted && !running && !p ? (
        <Notice>Your app&apos;s files are in this project. The security check didn&apos;t start{reason ? `: ${reason}` : ", so run it now"}.</Notice>
      ) : null}

      {running ? (
        <Card>
          <p className="flex items-center gap-2 text-sm text-ink-2" role="status">
            <CircleNotchIcon size={16} weight="bold" className="shrink-0 text-accent motion-safe:animate-spin" aria-hidden /> Checking the project. This takes a minute or two. Started <LocalTime iso={latest!.startedAt} />.
          </p>
        </Card>
      ) : null}
      {latest?.status === "failed" ? (
        <Card>
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <XCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {latest.error ?? "The check failed."}
          </p>
        </Card>
      ) : null}

      {!p && !running ? (
        <EmptyState icon={CheckCircleIcon} title="No security check yet">
          Run one to see what to fix first. It reads the project&apos;s files on Farbaek&apos;s side and changes nothing.
        </EmptyState>
      ) : null}

      {p && lastDone ? (
        <>
          <section className="grid gap-6 rounded-md border border-line bg-surface p-5 shadow-e1 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-6" aria-label="Score">
            <ScoreRing score={p.score} grade={p.grade} />
            <div className="grid gap-4">
              <p className="text-sm font-medium">{p.scope === "rules" ? "Rules check" : "Security check"}</p>
              <ul className="flex flex-wrap gap-2" aria-label="Findings by severity">
                {SEVERITIES.filter((s) => s !== "info").map((s) => (
                  <li key={s} className="flex items-center gap-2 text-sm">
                    <SeverityBadge severity={s} /> <span className="tabular text-ink-2">{p.counts[s]}</span>
                  </li>
                ))}
              </ul>
              <ul className="grid gap-1.5 text-sm">
                {p.checks.map((c) => (
                  <li key={c.name} className="flex items-start gap-2">
                    {c.ran ? <CheckCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden /> : <CircleDashedIcon size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />}
                    <span>
                      <span className="text-ink">{CHECK_LABELS[c.name]}</span>
                      <span className="text-ink-3">: {c.ran ? `${c.findings} found${c.detail ? `. ${c.detail}` : ""}` : `skipped. ${c.reason}`}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-ink-3">
                Checked <LocalTime iso={p.generatedAt} />, {p.project.files} files. Report{" "}
                <span className="font-mono" title={`sha256:${lastDone.digest}`}>
                  {shortHash(lastDone.digest!)}
                </span>
              </p>
            </div>
          </section>

          {grouped.length === 0 ? (
            <Card>
              <p className="flex items-center gap-2 text-sm text-ink-2">
                <CheckCircleIcon size={18} weight="bold" className="text-verified" aria-hidden /> Nothing to fix in what was checked.
              </p>
            </Card>
          ) : (
            grouped.map((g) => (
              <section key={g.severity} aria-labelledby={`sev-${g.severity}`} className="grid gap-3">
                <h2 id={`sev-${g.severity}`} className="flex items-center gap-2 text-lg font-medium">
                  {SEVERITY_LABELS[g.severity]} <span className="text-ink-3 tabular">{g.findings.length}</span>
                </h2>
                <ul className="grid gap-3">
                  {g.findings.map((f) => (
                    <li key={f.id} className="grid gap-3 rounded-md border border-line bg-surface p-5 shadow-e1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[0.9375rem] font-medium">{f.title}</p>
                          {f.file ? (
                            <p className="mt-1 break-all font-mono text-xs text-ink-2">
                              {f.file}
                              {f.line ? `:${f.line}` : ""}
                            </p>
                          ) : null}
                        </div>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-3">{SOURCE_LABEL[f.source]}</span>
                          <SeverityBadge severity={f.severity} />
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-ink-2">{f.detail}</p>
                      <p className="text-sm leading-relaxed">
                        <span className="font-medium">Fix: </span>
                        {f.fix}
                      </p>
                      {!reason ? (
                        <form action={fixWithAgentAction}>
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="reportId" value={lastDone.id} />
                          <input type="hidden" name="findingId" value={f.id} />
                          <button type="submit" className={buttonClasses("secondary", "sm")}>
                            <WrenchIcon size={16} weight="bold" aria-hidden /> Fix with the agent
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      ) : null}

      {reports.length > 1 ? (
        <section aria-labelledby="history-heading" className="grid gap-3">
          <h2 id="history-heading" className="text-lg font-medium">
            Earlier checks
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
            {reports.slice(1).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                <LocalTime iso={r.startedAt} />
                <span className="tabular text-ink-2">
                  {r.status === "done" ? `${r.statement?.predicate.scope === "rules" ? "Rules check, " : ""}${r.score}, grade ${r.grade}` : r.status === "failed" ? "Failed" : "Running"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
