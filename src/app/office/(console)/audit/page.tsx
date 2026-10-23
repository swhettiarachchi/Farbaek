import { CheckCircleIcon, ProhibitIcon, ScrollIcon, SealCheckIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { OfficeActionForm } from "@/components/office/action-form";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { ROLE_LABELS, isStaffRole } from "@/core/office/permissions";
import { requireStaff } from "@/server/office/access";
import { loadAuditPage } from "@/server/office/staff-data";
import { verifyAuditChainAction } from "./actions";

export const metadata: Metadata = { title: "Audit log" };

/** Plain names for what the log records; anything new shows its raw name. */
const ACTIONS: Record<string, string> = {
  "staff.bootstrapped": "Became the first owner",
  "staff.invited": "Invited someone",
  "staff.invite_accepted": "Joined from an invite",
  "staff.invite_revoked": "Withdrew an invite",
  "staff.role_changed": "Changed a role",
  "staff.removed": "Removed someone",
  "staff.mfa_reset_allowed": "Allowed a new authenticator",
  "staff.sessions_ended": "Ended someone's sessions",
  "auth.code_sent": "Email code sent",
  "auth.code_not_sent": "Email code couldn't be sent",
  "auth.code_verified": "Email code accepted",
  "auth.code_failed": "Wrong email code",
  "auth.totp_failed": "Wrong authenticator code",
  "auth.step_up_failed": "Wrong code for an action",
  "auth.signed_in": "Signed in",
  "auth.signed_out": "Signed out",
  "auth.session_ended": "Session ended",
  "auth.other_sessions_ended": "Ended their other sessions",
  "access.denied": "Refused",
  "factor.enrolled": "Added an authenticator",
  "factor.removed": "Removed an authenticator",
  "factor.reset_done": "Removed old authenticators",
  "audit.chain_checked": "Checked the audit chain",
};

function Result({ result }: { result: string }) {
  if (result === "success")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ink-2">
        <CheckCircleIcon size={14} weight="fill" className="text-verified" aria-hidden /> Done
      </span>
    );
  if (result === "denied")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ink-2">
        <ProhibitIcon size={14} weight="bold" className="text-approval" aria-hidden /> Refused
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-2">
      <XCircleIcon size={14} weight="fill" className="text-failed" aria-hidden /> Error
    </span>
  );
}

export default async function OfficeAudit({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const staff = await requireStaff();
  const { before } = await searchParams;
  const ownOnly = staff.can("audit.read_all") ? undefined : staff.user.id;
  const beforeSeq = before && /^\d{1,12}$/.test(before) ? Number(before) : undefined;
  const page = await loadAuditPage(staff.admin, { before: beforeSeq, ownOnly });

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Audit log"
        description="Every sign-in, refusal and change made in Office Space, newest first. Each event carries a hash of the one before it, so an edited, removed or reordered event shows when the chain is checked."
      />
      {ownOnly ? <Notice>Your role sees your own events here. Owners, admins and viewers see everyone&apos;s.</Notice> : null}

      <section aria-labelledby="chain-title" className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
        <div className="grid gap-4 rounded-md bg-surface p-5 shadow-e1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
          <div className="flex items-start gap-3">
            {page.lastCheck?.ok === false ? (
              <WarningCircleIcon size={24} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
            ) : (
              <SealCheckIcon size={24} weight={page.lastCheck ? "fill" : "regular"} className={`mt-0.5 shrink-0 ${page.lastCheck ? "text-verified" : "text-ink-3"}`} aria-hidden />
            )}
            <div>
              <h2 id="chain-title" className="font-medium">
                {page.lastCheck === null ? "The chain hasn't been checked yet" : page.lastCheck.ok ? `Checked through event ${page.lastCheck.throughSeq}` : `Broken at event ${page.lastCheck.firstBadSeq}`}
              </h2>
              <p className="mt-1 text-sm text-ink-2">
                {page.lastCheck ? (
                  <>
                    Last checked <RelativeTime iso={page.lastCheck.at} />. Checks are recorded too, in their own log.
                  </>
                ) : (
                  "A check recomputes every event's hash and link, from the first event on."
                )}
              </p>
            </div>
          </div>
          {staff.can("audit.verify") ? (
            <OfficeActionForm action={verifyAuditChainAction} submit="Check the chain now" tone="secondary" className="grid justify-items-start gap-2 sm:justify-items-end">
              <span className="sr-only">Recompute every event&apos;s hash</span>
            </OfficeActionForm>
          ) : null}
        </div>
      </section>

      {page.rows.length === 0 ? (
        <EmptyState icon={ScrollIcon} title="Nothing recorded yet">
          Events appear here from the first sign-in.
        </EmptyState>
      ) : (
        <ol className="grid gap-2" aria-label="Audit events, newest first">
          {page.rows.map((e) => (
            <li key={e.seq} className="grid gap-x-4 gap-y-1 rounded-md border border-line bg-surface px-4 py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-start">
              <span className="font-mono text-xs text-ink-3 tabular">#{e.seq}</span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium text-ink">{ACTIONS[e.action] ?? e.action}</span>
                  <Result result={e.result} />
                  {e.strength === "step_up" ? <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs text-ink-2">Fresh code</span> : null}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-3">
                  <span>
                    {e.actor ?? "Someone not signed in"}
                    {e.actorRole && isStaffRole(e.actorRole) ? `, ${ROLE_LABELS[e.actorRole]}` : ""}
                  </span>
                  {e.targetType ? <span>{e.targetType}</span> : null}
                  <span className="font-mono">{e.action}</span>
                </p>
                {e.reason ? <p className="mt-1.5 max-w-[70ch] text-sm text-ink-2">&ldquo;{e.reason}&rdquo;</p> : null}
              </div>
              <span className="text-xs text-ink-3 sm:text-right" title={e.at}>
                <RelativeTime iso={e.at} />
                <span className="block">
                  <LocalTime iso={e.at} />
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {page.nextBefore ? (
        <Link href={`/audit?before=${page.nextBefore}`} className={buttonClasses("secondary", "sm", "justify-self-start")}>
          Older events
        </Link>
      ) : null}
    </div>
  );
}
