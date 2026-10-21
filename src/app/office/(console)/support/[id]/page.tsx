import { ArrowLeftIcon, BuildingsIcon, FlagIcon, LockSimpleIcon, ProhibitIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip } from "@/components/admin/table";
import { Card, Notice } from "@/components/app/primitives";
import { BrandLogo } from "@/components/brand/brand-logo";
import { OfficeActionForm } from "@/components/office/action-form";
import { SupportReplyForm } from "@/components/office/support-reply";
import { LocalTime } from "@/components/ui/local-time";
import { STAFF_STATUS_WORDS, TOPIC_LABELS } from "@/core/support/support";
import { requireStaff } from "@/server/office/access";
import { loadWorkspaceBrief } from "@/server/office/controls-data";
import { loadSupportThread } from "@/server/office/support-data";
import { staffSupportReplyAction, staffSupportUpdateAction } from "./actions";

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
        <ArrowLeftIcon size={14} aria-hidden /> Support
      </Link>

      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={thread.status === "waiting_on_farbaek" ? "approval" : closed ? "neutral" : "accent"}>{STAFF_STATUS_WORDS[thread.status]}</Chip>
          <Chip tone={thread.topic === "abuse" ? "failed" : "neutral"}>
            {thread.topic === "abuse" ? <FlagIcon size={12} weight="fill" className="mr-1" aria-hidden /> : null}
            {TOPIC_LABELS[thread.topic]}
          </Chip>
          <span className="text-xs text-ink-3">
            Opened <LocalTime iso={thread.createdAt} />
          </span>
        </div>
        <h1 className="text-balance text-[1.6rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2rem]">{thread.subject}</h1>
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
                  <div className="whitespace-pre-wrap break-words rounded-md border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed shadow-e1">{m.body}</div>
                </li>
              ) : m.internal ? (
                <li key={m.id} className="grid gap-1.5">
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-3">
                    <LockSimpleIcon size={13} aria-hidden />
                    <span>
                      <span className="font-medium text-ink-2">Internal note</span> by <span className="break-all">{m.staffEmail ?? "a former staff member"}</span>
                    </span>
                    <span aria-hidden>·</span>
                    <LocalTime iso={m.createdAt} />
                  </p>
                  <div className="whitespace-pre-wrap break-words rounded-md border border-dashed border-line-strong/50 bg-[repeating-linear-gradient(135deg,transparent_0_10px,var(--color-surface-raised)_10px_12px)] px-4 py-3 text-[15px] leading-relaxed text-ink">
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
                  <div className="whitespace-pre-wrap break-words rounded-md border border-accent/15 bg-accent/[0.05] px-4 py-3 text-[15px] leading-relaxed">{m.body}</div>
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
            <h2 className="text-sm font-medium text-ink-3">From</h2>
            <p className="mt-1 break-all text-[15px] font-medium">{thread.email}</p>
            {workspace ? (
              <div className="mt-4 grid gap-2 border-t border-line pt-4 text-sm">
                <Link href={`/workspaces/${workspace.id}`} className="inline-flex min-h-11 items-center gap-2 font-medium text-accent hover:underline">
                  <BuildingsIcon size={16} aria-hidden /> {workspace.name}
                </Link>
                <p className="text-ink-2">
                  {workspace.plan}
                  {workspace.trialDaysLeft !== null ? `, ${workspace.trialDaysLeft} trial ${workspace.trialDaysLeft === 1 ? "day" : "days"} left` : ""}
                </p>
                {workspace.suspension ? (
                  <p className="flex items-start gap-1.5 text-failed">
                    <ProhibitIcon size={15} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
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
              <h2 className="text-sm font-medium text-ink-3">Handling</h2>
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
