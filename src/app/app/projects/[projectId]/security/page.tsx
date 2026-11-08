import { ArrowLeftIcon, CheckCircleIcon, ClockCounterClockwiseIcon, InfoIcon, ShieldCheckIcon, WarningCircleIcon, WarningIcon, WarningOctagonIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle, EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { RunSecurityCheck } from "@/components/security/run-check";
import { ScoreRing } from "@/components/security/score-ring";
import { LocalTime } from "@/components/ui/local-time";
import { StatusGlyph, type Status } from "@/components/ui/status-badge";
import { PLAN_UNCONFIRMED_MESSAGE } from "@/core/billing/entitlements";
import { SEVERITIES, SEVERITY_LABELS, type Finding, type Severity } from "@/core/security/findings";
import { CHECK_LABELS } from "@/core/security/report";
import { loadProjectReports } from "@/server/security/page-data";
import { checkScope } from "@/server/security/runner";
import type { SecurityReportView } from "@/server/security/store";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import { FixWithAgent } from "@/components/security/fix-with-agent";

export const metadata: Metadata = { title: "Security" };

// The severity ladder (ADR 0183): each step has its word, a filled icon, its colour and its border, the same in the
// section heading and on each finding's chip, so colour is never the only signal.
const SEVERITY_LOOK: Record<Severity, { icon: Icon; tone: string; chip: string }> = {
  critical: { icon: WarningOctagonIcon, tone: "text-failed", chip: "border-failed/35 bg-failed/[0.05]" },
  high: { icon: WarningIcon, tone: "text-failed", chip: "border-failed/35" },
  medium: { icon: WarningCircleIcon, tone: "text-caution", chip: "border-caution/35" },
  low: { icon: InfoIcon, tone: "text-info", chip: "border-info/30" },
  info: { icon: InfoIcon, tone: "text-ink-3", chip: "border-line-2" },
};

const SOURCE_LABEL: Record<Finding["source"], string> = { rules: "Rule", dependencies: "Packages", sast: "Semgrep", secrets: "Secret scan", ai: "AI review" };

function SeverityBadge({ severity }: { severity: Severity }) {
  const { icon: SeverityIcon, tone, chip } = SEVERITY_LOOK[severity];
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium ${tone} ${chip}`}>
      <SeverityIcon size={14} weight="fill" className="shrink-0" aria-hidden />
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

/** A severity section's title: the same shape as every section title, with the severity's own filled icon in its colour. */
function SeverityTitle({ severity, id }: { severity: Severity; id: string }) {
  const { icon: SeverityIcon, tone } = SEVERITY_LOOK[severity];
  return (
    <h2 id={id} className="flex items-center gap-2.5 text-lg font-medium">
      <SeverityIcon size={20} weight="fill" className={`shrink-0 ${tone}`} aria-hidden />
      <span className="min-w-0">{SEVERITY_LABELS[severity]}</span>
    </h2>
  );
}

// An earlier check's run, as its kind: finished, failed, or still going.
const RUN_KIND: Record<SecurityReportView["status"], Status> = { done: "done", failed: "failed", running: "working" };

/** "3 high and 1 low findings", from the counts that aren't zero; informational notes aren't counted. */
function severityWords(counts: Record<Severity, number>): string | null {
  const counted = SEVERITIES.filter((s) => s !== "info" && counts[s] > 0);
  if (counted.length === 0) return null;
  const parts = counted.map((s) => `${counts[s]} ${SEVERITY_LABELS[s].toLowerCase()}`);
  const total = counted.reduce((n, s) => n + counts[s], 0);
  const list = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${list} ${total === 1 ? "finding" : "findings"}`;
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
  const found = p ? severityWords(p.counts) : null;

  return (
    <div className="grid gap-6">
      <Link href={`/app/projects/${project.id}`} className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-ink-2 hover:text-ink">
        <ArrowLeftIcon size={14} weight="bold" aria-hidden /> {project.name}
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
            <StatusGlyph status="working" /> Checking the project. This takes a minute or two. Started <LocalTime iso={latest!.startedAt} />.
          </p>
        </Card>
      ) : null}
      {latest?.status === "failed" ? (
        <Card>
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {latest.error ?? "The check failed."}
          </p>
        </Card>
      ) : null}

      {!p && !running ? (
        <EmptyState icon={ShieldCheckIcon} title="No security check yet">
          Run one to see what to fix first. It reads the project&apos;s files on Farbaek&apos;s side and changes nothing.
        </EmptyState>
      ) : null}

      {p && lastDone ? (
        <>
          <section className="grid gap-6 rounded-md border border-line bg-surface p-5 shadow-e1 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-6" aria-label="Score">
            <ScoreRing score={p.score} grade={p.grade} />
            <div className="grid gap-4">
              <div className="grid gap-1">
                <p className="text-sm font-medium">{p.scope === "rules" ? "Rules check" : "Security check"}</p>
                <p className="text-sm text-ink-2">
                  {found ? (
                    <>
                      It found <span className="font-medium text-ink tabular">{found}</span>.
                    </>
                  ) : (
                    "It found nothing critical, high, medium or low."
                  )}
                </p>
              </div>
              <ul className="grid gap-1.5 text-sm">
                {p.checks.map((c) => (
                  <li key={c.name} className="flex items-start gap-2">
                    {/* A part that ran is verified; a skipped one is "not yet", and says why in words. */}
                    <StatusGlyph status={c.ran ? "verified" : "unverified"} className="mt-0.5" />
                    <span>
                      <span className="text-ink">{CHECK_LABELS[c.name]}</span>
                      <span className="text-ink-3">: {c.ran ? `${c.findings} found${c.detail ? `. ${c.detail}` : ""}` : `skipped. ${c.reason}`}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-ink-3" title={`Report sha256:${lastDone.digest}`}>
                Checked <LocalTime iso={p.generatedAt} />, {p.project.files} {p.project.files === 1 ? "file" : "files"}.
              </p>
            </div>
          </section>

          {grouped.length === 0 ? (
            <Card>
              <p className="flex items-center gap-2 text-sm text-ink-2">
                <CheckCircleIcon size={16} weight="fill" className="shrink-0 text-verified" aria-hidden /> Nothing to fix in what was checked.
              </p>
            </Card>
          ) : (
            grouped.map((g) => (
              <section key={g.severity} aria-labelledby={`sev-${g.severity}`} className="grid gap-3">
                <SeverityTitle severity={g.severity} id={`sev-${g.severity}`} />
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
                          <span className="text-xs text-ink-3">{SOURCE_LABEL[f.source]}</span>
                          <SeverityBadge severity={f.severity} />
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-ink-2">{f.detail}</p>
                      <p className="text-sm leading-relaxed">
                        <span className="font-medium">Fix: </span>
                        {f.fix}
                      </p>
                      {!reason ? <FixWithAgent projectId={project.id} reportId={lastDone.id} findingId={f.id} /> : null}
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
          <CardTitle id="history-heading" icon={ClockCounterClockwiseIcon}>
            Earlier checks
          </CardTitle>
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
            {reports.slice(1).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                <LocalTime iso={r.startedAt} />
                <span className="inline-flex items-center gap-1.5 tabular text-ink-2">
                  <StatusGlyph status={RUN_KIND[r.status]} size={14} />
                  {r.status === "done" ? `${r.statement?.predicate.scope === "rules" ? "Rules check: score" : "Score"} ${r.score}, grade ${r.grade}` : r.status === "failed" ? "Failed" : "Running"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
