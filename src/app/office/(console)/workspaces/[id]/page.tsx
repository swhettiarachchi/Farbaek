import { ArrowLeftIcon, ArrowSquareOutIcon, ProhibitIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip } from "@/components/admin/table";
import { Card, Notice } from "@/components/app/primitives";
import { OfficeActionForm } from "@/components/office/action-form";
import { officeInputClass, ReasonField, StepUpField } from "@/components/office/fields";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { USD_PER_UNIT } from "@/core/billing/rate-card";
import { maskEmail, USAGE_CAPS, USAGE_STEP_UP_UNITS } from "@/core/office/permissions";
import { usd } from "@/server/admin/summaries";
import { requireStaff } from "@/server/office/access";
import { loadWorkspace360 } from "@/server/office/controls-data";
import { siteDomain } from "@/server/publish/config";
import { addUsageAction, restoreWorkspaceAction, suspendWorkspaceAction } from "./actions";

export const metadata: Metadata = { title: "Workspace" };

const number = new Intl.NumberFormat("en-US");
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

  return (
    <div className="grid gap-8">
      <div className="grid gap-4">
        <Link href="/workspaces" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} aria-hidden /> All workspaces
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-balance text-[1.75rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2.1rem]">{ws.name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <Chip tone={ws.trialDaysLeft !== null ? "accent" : "neutral"}>{ws.plan}</Chip>
              {ws.trialDaysLeft !== null ? <span>{ws.trialDaysLeft} trial days left</span> : null}
              <span className="text-ink-3">
                Created <LocalTime iso={ws.createdAt} />
              </span>
              <span className="font-mono text-xs text-ink-3">{ws.id}</span>
            </p>
          </div>
        </div>
        {ws.suspension ? (
          <p role="status" className="flex items-start gap-2.5 rounded-sm border border-failed/30 bg-failed/[0.05] px-4 py-3 text-sm text-ink">
            <ProhibitIcon size={18} weight="bold" className="mt-px shrink-0 text-failed" aria-hidden />
            <span>
              <span className="font-medium">Suspended</span> <RelativeTime iso={ws.suspension.at} />. Members see: &ldquo;{ws.suspension.notice}&rdquo;
            </span>
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <Card>
            <h2 className="text-lg font-medium">Members</h2>
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
            <h2 className="text-lg font-medium">Projects and sites</h2>
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
                        {s.name}.{domain} <ArrowSquareOutIcon size={13} aria-hidden />
                      </a>
                    ) : (
                      <span className="font-mono text-ink-2">{domain ? `${s.name}.${domain}` : s.name}</span>
                    )}
                    <Chip tone={s.blocked ? "failed" : s.live ? "verified" : "neutral"}>{s.blocked ? "Taken offline" : s.live ? "Live" : "Offline"}</Chip>
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
            <h2 className="text-lg font-medium">Recent agent runs</h2>
            {ws.runs.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">No runs yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {ws.runs.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0 truncate">{r.task}</span>
                    <span className="flex items-center gap-2 text-xs text-ink-3">
                      <Chip>{r.status}</Chip> <RelativeTime iso={r.startedAt} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <h2 className="text-lg font-medium">AI usage</h2>
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
          </Card>

          {staff.can("usage.add") ? (
            <section aria-labelledby="add-usage-title" className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
              <div className="grid gap-4 rounded-md bg-surface p-5 shadow-e1">
                <div>
                  <h2 id="add-usage-title" className="text-lg font-medium">
                    Add AI usage
                  </h2>
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
              <h2 id="danger-title" className="flex items-center gap-2 text-lg font-medium">
                <ProhibitIcon size={18} weight="bold" className="text-failed" aria-hidden /> {ws.suspension ? "Restore this workspace" : "Suspend this workspace"}
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
