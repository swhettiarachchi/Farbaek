import { ArrowLeftIcon, BuildingsIcon, FlagIcon, LockSimpleIcon, UserCircleIcon, UserSwitchIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip } from "@/components/admin/table";
import { Card, CardTitle, Notice } from "@/components/app/primitives";
import { BrandLogo } from "@/components/brand/brand-logo";
import { OfficeActionForm } from "@/components/office/action-form";
import { SupportReplyForm } from "@/components/office/support-reply";
import { LocalTime } from "@/components/ui/local-time";
import { StatusGlyph } from "@/components/ui/status-badge";
import { STAFF_STATUS_WORDS, TOPIC_LABELS } from "@/core/support/support";
import { requireStaff } from "@/server/office/access";
import { loadWorkspaceBrief } from "@/server/office/controls-data";
import { loadSupportThread } from "@/server/office/support-data";
import { staffSupportReplyAction, staffSupportUpdateAction } from "./actions";
import { PAGE_TITLE } from "@/components/ui/titles";

export const metadata: Metadata = { title: "Support request" };

export default async function OfficeSupportThread({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!staff.can("support.read")) notFound();
  const thread = await loadSupportThread(staff.admin, id, staff.can("people.read_email"));
  if (!thread) notFound();
  const workspace = thread.orgId ? await loadWorkspaceBrief(staff.admin, thread.orgId) : null;
  const canReply = staff.can("support.reply");
  const mine = thread.assignedTo === staff.user.id;
  const closed = thread.status === "closed";

  return (
    <div className="grid gap-6">
      <Link href="/support" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeftIcon size={14} weight="bold" aria-hidden /> Support
      </Link>

      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Waiting on Farbaek is the staff's turn; waiting on the customer is someone else's; closed is done (ADR 0183). */}
          <Chip kind={thread.status === "waiting_on_farbaek" ? "approval" : closed ? "done" : "pending"}>{STAFF_STATUS_WORDS[thread.status]}</Chip>
          {thread.topic === "abuse" ? (
            <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border border-failed/35 px-2.5 text-xs font-medium text-failed">
              <FlagIcon size={14} weight="bold" className="shrink-0" aria-hidden />
              {TOPIC_LABELS[thread.topic]}
            </span>
          ) : (
            <Chip>{TOPIC_LABELS[thread.topic]}</Chip>
          )}
          <span className="text-xs text-ink-3">
            Opened <LocalTime iso={thread.createdAt} />
          </span>
        </div>
        <h1 className={PAGE_TITLE}>{thread.subject}</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="grid gap-6">
          <ol className="grid gap-4" aria-label="Messages">
            {thread.messages.map((m) =>
              !m.fromStaff ? (
                <li key={m.id} className="grid gap-1.5">
                  <p className="text-xs text-ink-3">
                    <span className="font-medium text-ink-2">{thread.email}</span> · <LocalTime iso={m.createdAt} />
                  </p>
                  <div className="whitespace-pre-wrap break-words rounded-md border border-line bg-surface px-4 py-3 text-body leading-relaxed shadow-e1">{m.body}</div>
                </li>
              ) : m.internal ? (
                <li key={m.id} className="grid gap-1.5">
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-3">
                    <LockSimpleIcon size={14} weight="bold" aria-hidden />
                    <span>
                      <span className="font-medium text-ink-2">Internal note</span> by <span className="break-all">{m.staffEmail ?? "a former staff member"}</span>
                    </span>
                    <span aria-hidden>·</span>
                    <LocalTime iso={m.createdAt} />
                  </p>
                  <div className="whitespace-pre-wrap break-words rounded-md border border-line-2 bg-surface-raised px-4 py-3 text-body leading-relaxed text-ink">
                    {m.body}
                  </div>
                </li>
              ) : (
                <li key={m.id} className="grid gap-1.5 sm:pl-10">
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-3">
                    <BrandLogo height={16} />
                    <span>
                      <span className="font-medium text-ink-2">Farbaek support</span> <span className="break-all">({m.staffEmail ?? "a former staff member"})</span>
                    </span>
                    <span aria-hidden>·</span>
                    <LocalTime iso={m.createdAt} />
                  </p>
                  <div className="whitespace-pre-wrap break-words rounded-md border border-accent/15 bg-accent/[0.05] px-4 py-3 text-body leading-relaxed">{m.body}</div>
                </li>
              ),
            )}
          </ol>

          {canReply ? (
            <Card>
              <SupportReplyForm threadId={thread.id} action={staffSupportReplyAction} />
            </Card>
          ) : (
            <Notice>Your role can read this request but not reply to it.</Notice>
          )}
        </div>

        <aside className="grid gap-4">
          <Card>
            <CardTitle icon={UserCircleIcon}>From</CardTitle>
            <p className="mt-1 break-all text-body font-medium">{thread.email}</p>
            {workspace ? (
              <div className="mt-4 grid gap-2 border-t border-line pt-4 text-sm">
                <Link href={`/workspaces/${workspace.id}`} className="inline-flex min-h-11 items-center gap-2 font-medium text-accent hover:underline">
                  <BuildingsIcon size={16} weight="bold" aria-hidden /> {workspace.name}
                </Link>
                <p className="text-ink-2">
                  {workspace.plan}
                  {workspace.trialDaysLeft !== null ? `, ${workspace.trialDaysLeft} trial ${workspace.trialDaysLeft === 1 ? "day" : "days"} left` : ""}
                </p>
                {workspace.suspension ? (
                  <p className="flex items-start gap-1.5">
                    <StatusGlyph status="blocked" className="mt-0.5" />
                    <span className="text-ink">Suspended. Members see: &ldquo;{workspace.suspension.notice}&rdquo;</span>
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-3">Sent without a workspace.</p>
            )}
          </Card>

          {canReply ? (
            <Card>
              <CardTitle icon={UserSwitchIcon}>Handling</CardTitle>
              <div className="mt-3 grid gap-3">
                <OfficeActionForm action={staffSupportUpdateAction} submit={mine ? "Unassign me" : "Assign to me"} tone="secondary" className="grid gap-2">
                  <input type="hidden" name="threadId" value={thread.id} />
                  <input type="hidden" name="action" value={mine ? "unassign" : "assign_me"} />
                </OfficeActionForm>
                <OfficeActionForm action={staffSupportUpdateAction} submit={closed ? "Reopen" : "Close request"} tone="secondary" className="grid gap-2">
                  <input type="hidden" name="threadId" value={thread.id} />
                  <input type="hidden" name="action" value={closed ? "reopen" : "close"} />
                </OfficeActionForm>
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
