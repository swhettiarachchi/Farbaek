import { ArrowLeftIcon, ArrowUpRightIcon, ClockIcon, GaugeIcon, HammerIcon, PlusCircleIcon, ProhibitIcon, SquaresFourIcon, UsersThreeIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip } from "@/components/admin/table";
import { Card, CardTitle, Notice } from "@/components/app/primitives";
import { RunStatusBadge } from "@/components/build/run-status";
import { RUN_STATUSES, type RunStatus } from "@/core/agent/cloud-run";
import { OfficeActionForm } from "@/components/office/action-form";
import { officeInputClass, ReasonField, StepUpField } from "@/components/office/fields";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { USD_PER_UNIT } from "@/core/billing/rate-card";
import { TRIAL_MAX_DAYS } from "@/core/billing/trial";
import { maskEmail, TRIAL_EXTEND_CAPS, USAGE_CAPS, USAGE_STEP_UP_UNITS } from "@/core/office/permissions";
import { usd } from "@/server/admin/summaries";
import { requireStaff } from "@/server/office/access";
import { loadWorkspace360 } from "@/server/office/controls-data";
import { siteDomain } from "@/server/publish/config";
import { addUsageAction, extendTrialAction, restoreWorkspaceAction, suspendWorkspaceAction } from "./actions";

export const metadata: Metadata = { title: "Workspace" };

const number = new Intl.NumberFormat("en-US");
const isRunStatus = (s: string): s is RunStatus => (RUN_STATUSES as readonly string[]).includes(s);
const GRANT_LABELS: Record<string, string> = { plan: "Plan", trial: "Trial", free: "Free", topup: "Top-up", adjustment: "Added by Farbaek" };

export default async function OfficeWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ws = await loadWorkspace360(staff.admin, id);
  if (!ws) notFound();
  const domain = siteDomain();
  const showEmail = staff.can("people.read_email");
  const cap = USAGE_CAPS[staff.role] ?? 0;
  const trialRoom = ws.trial ? Math.max(0, TRIAL_MAX_DAYS - ws.trial.days) : 0;
  const supportUsed = staff.role === "support" && ws.trial !== null && ws.trial.days > 14;
  const trialCap = Math.min(TRIAL_EXTEND_CAPS[staff.role] ?? 0, trialRoom);
  const dayChoices = [...new Set([1, 3, 5, 7, 10, 14, 21, 30].filter((d) => d < trialCap).concat(trialCap))].filter((d) => d > 0);

  return (
    <div className="grid gap-8">
      <div className="grid gap-4">
        <Link href="/workspaces" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} weight="bold" aria-hidden /> All workspaces
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-balance text-[1.75rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2.1rem]">{ws.name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <Chip>{ws.plan}</Chip>
              {ws.trialDaysLeft !== null ? <span>{ws.trialDaysLeft} trial days left</span> : null}
              <span className="text-ink-3">
                Created <LocalTime iso={ws.createdAt} />
              </span>
              <span className="font-mono text-xs text-ink-3">{ws.id}</span>
            </p>
          </div>
        </div>
        {ws.suspension ? (
          <p role="status" className="flex items-start gap-2.5 rounded-sm border border-line bg-surface-raised/70 px-4 py-3 text-sm text-ink">
            <ProhibitIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
            <span>
              <span className="font-medium">Suspended</span> <RelativeTime iso={ws.suspension.at} />. Members see: &ldquo;{ws.suspension.notice}&rdquo;
            </span>
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <Card>
            <CardTitle icon={UsersThreeIcon}>Members</CardTitle>
            <ul className="mt-3 divide-y divide-line">
              {ws.members.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="break-all">{showEmail ? m.email : maskEmail(m.email)}</span>
                  <Chip>{m.role}</Chip>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle icon={SquaresFourIcon}>Projects and sites</CardTitle>
            {ws.projects.length === 0 ? <p className="mt-2 text-sm text-ink-2">No projects yet.</p> : null}
            <ul className="mt-3 grid gap-2 text-sm">
              {ws.projects.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className={p.archived ? "text-ink-3" : "text-ink"}>{p.name}</span>
                  <span className="text-xs text-ink-3">{p.archived ? "Archived" : <RelativeTime iso={p.createdAt} />}</span>
                </li>
              ))}
            </ul>
            {ws.sites.length > 0 ? (
              <ul className="mt-4 grid gap-2 border-t border-line pt-4 text-sm">
                {ws.sites.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                    {domain && s.live ? (
                      <a href={`https://${s.name}.${domain}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-accent hover:underline">
                        {s.name}.{domain} <ArrowUpRightIcon size={14} weight="bold" className="shrink-0" aria-hidden />
                      </a>
                    ) : (
                      <span className="font-mono text-ink-2">{domain ? `${s.name}.${domain}` : s.name}</span>
                    )}
                    <Chip kind={s.blocked ? "blocked" : s.live ? "verified" : "off"}>{s.blocked ? "Taken offline" : s.live ? "Live" : "Offline"}</Chip>
                  </li>
                ))}
                <li>
                  <Link href="/sites" className="inline-flex min-h-11 items-center text-sm text-accent hover:underline">
                    Manage sites
                  </Link>
                </li>
              </ul>
            ) : null}
          </Card>

          <Card>
            <CardTitle icon={HammerIcon}>Recent agent runs</CardTitle>
            {ws.runs.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">No runs yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {ws.runs.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0 truncate">{r.task}</span>
                    <span className="flex items-center gap-2 text-xs text-ink-3">
                      {isRunStatus(r.status) ? <RunStatusBadge status={r.status} /> : <Chip>{r.status}</Chip>} <RelativeTime iso={r.startedAt} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardTitle icon={GaugeIcon}>AI usage</CardTitle>
            <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-ink-3">This period used</dt>
                <dd className="mt-1 font-mono text-xl tabular">{ws.aiPercent === null ? "None" : `${ws.aiPercent}%`}</dd>
              </div>
              <div>
                <dt className="text-ink-3">List cost this month</dt>
                <dd className="mt-1 font-mono text-xl tabular">{usd(ws.aiCostThisMonthUsd)}</dd>
              </div>
            </dl>
            {ws.grants.length > 0 ? (
              <ul className="mt-4 grid gap-2 border-t border-line pt-4 text-sm">
                {ws.grants.slice(0, 8).map((g, i) => (
                  <li key={`${g.startsAt}-${i}`} className="flex flex-wrap items-center justify-between gap-2">
                    <span className={g.kind === "adjustment" ? "font-medium text-ink" : "text-ink-2"}>{GRANT_LABELS[g.kind] ?? g.kind}</span>
                    <span className="font-mono text-xs text-ink-3 tabular">
                      {number.format(g.used)} / {number.format(g.units)} · until <LocalTime iso={g.expiresAt} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          {staff.can("trial.extend") && ws.trial ? (
            <section aria-labelledby="trial-title" className="grid gap-4 rounded-md border border-line bg-surface p-5 shadow-e1">
              <div>
                <CardTitle id="trial-title" icon={ClockIcon}>
                  Extend the trial
                </CardTitle>
                <p className="mt-1 text-sm text-ink-2">
                  {ws.trial.days} days so far, ending <LocalTime iso={ws.trial.endsAt} />. A trial can run {TRIAL_MAX_DAYS} days at most; the trial&apos;s AI usage moves with it.
                </p>
              </div>
              {supportUsed ? (
                <Notice>This trial was already extended. Support can extend a trial once; an admin or owner can add more.</Notice>
              ) : trialCap === 0 ? (
                <Notice>This trial is already at {TRIAL_MAX_DAYS} days, the most a trial can run.</Notice>
              ) : (
                <OfficeActionForm action={extendTrialAction} submit="Extend the trial" tone="secondary" className="grid gap-3">
                  <input type="hidden" name="orgId" value={ws.id} />
                  <label htmlFor="trial-days" className="grid gap-1.5 text-sm">
                    <span className="font-medium text-ink">Add</span>
                    <select id="trial-days" name="days" defaultValue={String(Math.min(7, trialCap))} className={officeInputClass}>
                      {dayChoices.map((d) => (
                        <option key={d} value={d}>
                          {d} {d === 1 ? "day" : "days"}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-ink-3">Counted from the later of today and the current end. Your role can add up to {TRIAL_EXTEND_CAPS[staff.role]} days{staff.role === "support" ? ", once" : ""}.</span>
                  </label>
                  <ReasonField id="trial-reason" />
                </OfficeActionForm>
              )}
            </section>
          ) : null}

          {staff.can("usage.add") ? (
            <section aria-labelledby="add-usage-title" className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
              <div className="grid gap-4 rounded-md bg-surface p-5 shadow-e1">
                <div>
                  <CardTitle id="add-usage-title" icon={PlusCircleIcon}>
                    Add AI usage
                  </CardTitle>
                  <p className="mt-1 text-sm text-ink-2">
                    Shown to the workspace as &ldquo;Added by Farbaek&rdquo;. It isn&apos;t a payment and doesn&apos;t touch billing. Your role can add up to {usd(cap * USD_PER_UNIT)} at once; above{" "}
                    {usd(USAGE_STEP_UP_UNITS * USD_PER_UNIT)} it needs a fresh code.
                  </p>
                </div>
                <OfficeActionForm action={addUsageAction} submit="Add AI usage" className="grid gap-3">
                  <input type="hidden" name="orgId" value={ws.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label htmlFor="usage-dollars" className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">Amount, US dollars of list cost</span>
                      <input id="usage-dollars" name="dollars" inputMode="decimal" required placeholder="5" className={officeInputClass} />
                    </label>
                    <label htmlFor="usage-days" className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">Lasts</span>
                      <select id="usage-days" name="days" defaultValue="30" className={officeInputClass}>
                        {[7, 14, 30, 60, 90].map((d) => (
                          <option key={d} value={d}>
                            {d} days
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <ReasonField id="usage-reason" />
                  <details className="text-sm">
                    <summary className="flex min-h-11 cursor-pointer items-center text-ink-2">Adding more than {usd(USAGE_STEP_UP_UNITS * USD_PER_UNIT)}?</summary>
                    <StepUpField id="usage-totp" />
                  </details>
                </OfficeActionForm>
              </div>
            </section>
          ) : null}

          {staff.can("workspace.suspend") ? (
            <section aria-labelledby="danger-title" className="grid gap-4 rounded-md border border-failed/25 p-5">
              {/* A callout with its title: its icon in the failed colour (ADR 0183). */}
              <h2 id="danger-title" className="flex items-center gap-2.5 text-lg font-medium">
                <ProhibitIcon size={20} className="shrink-0 text-failed" aria-hidden /> {ws.suspension ? "Restore this workspace" : "Suspend this workspace"}
              </h2>
              {ws.suspension ? (
                <OfficeActionForm action={restoreWorkspaceAction} submit={`Restore ${ws.name}`} tone="secondary" className="grid gap-3">
                  <input type="hidden" name="orgId" value={ws.id} />
                  <ReasonField id="restore-reason" />
                </OfficeActionForm>
              ) : (
                <>
                  <p className="text-sm text-ink-2">
                    Members keep their data and can read it, but can&apos;t change anything, run the agent or publish. Its sites show &ldquo;temporarily unavailable&rdquo;, and live runs stop.
                  </p>
                  <OfficeActionForm action={suspendWorkspaceAction} submit={`Suspend ${ws.name}`} tone="danger" className="grid gap-3">
                    <input type="hidden" name="orgId" value={ws.id} />
                    <label htmlFor="suspend-notice" className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">Notice members will see</span>
                      <textarea id="suspend-notice" name="notice" required minLength={10} maxLength={500} rows={2} className={`${officeInputClass} h-auto min-h-20 py-3`} placeholder="What's paused, why, and how to reach Farbaek" />
                    </label>
                    <ReasonField id="suspend-reason" label="Internal reason, for the audit log" />
                    <label htmlFor="suspend-confirm" className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">
                        Type <span className="font-mono">{ws.name}</span> to confirm
                      </span>
                      <input id="suspend-confirm" name="confirmName" required autoComplete="off" className={officeInputClass} />
                    </label>
                  </OfficeActionForm>
                </>
              )}
            </section>
          ) : (
            <Notice>Your role can see this workspace but not suspend it or add usage.</Notice>
          )}
        </div>
      </div>
    </div>
  );
}
