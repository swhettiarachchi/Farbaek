import { CaretRightIcon, ChatsCircleIcon, FlagIcon, UserCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Chip } from "@/components/admin/table";
import { EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { STAFF_STATUS_WORDS, SUPPORT_STATUSES, TOPIC_LABELS, isSupportStatus, waitingFor, type SupportStatus } from "@/core/support/support";
import { requireStaff } from "@/server/office/access";
import { loadSupportQueue } from "@/server/office/support-data";

export const metadata: Metadata = { title: "Support" };

const TAB_WORDS: Record<SupportStatus, string> = { waiting_on_farbaek: "Waiting on us", waiting_on_you: "Answered", closed: "Closed" };
const SINCE_WORDS: Record<SupportStatus, string> = { waiting_on_farbaek: "Waiting", waiting_on_you: "Answered", closed: "Closed" };
const EMPTY: Record<SupportStatus, string> = {
  waiting_on_farbaek: "Nobody is waiting on Farbaek right now.",
  waiting_on_you: "No answered requests are waiting on a customer.",
  closed: "No closed requests yet.",
};

function tabHref(status: SupportStatus, abuse: boolean): string {
  const params = new URLSearchParams();
  if (status !== "waiting_on_farbaek") params.set("status", status);
  if (abuse) params.set("abuse", "1");
  const q = params.toString();
  return q ? `/support?${q}` : "/support";
}

export default async function OfficeSupport({ searchParams }: { searchParams: Promise<{ status?: string; abuse?: string }> }) {
  const staff = await requireStaff();
  const { status: rawStatus, abuse: rawAbuse } = await searchParams;
  if (!staff.can("support.read")) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Support" />
        <Notice>Your role doesn&apos;t read customers&apos; support requests. Owners, admins, support and trust and safety do.</Notice>
      </div>
    );
  }
  const status: SupportStatus = isSupportStatus(rawStatus) ? rawStatus : "waiting_on_farbaek";
  const abuse = rawAbuse === "1";
  const now = new Date();
  const rows = await loadSupportQueue(staff.admin, status, abuse, { userId: staff.user.id, showEmail: staff.can("people.read_email") });

  return (
    <div className="grid gap-6">
      <PageHeader title="Support" description="Requests people send from Help in the app. Replies are signed Farbaek support; your name is only in the audit log." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Support queues" className="grid w-full grid-cols-3 gap-1 rounded-full border border-line bg-surface-raised/60 p-1 sm:inline-grid sm:w-auto">
          {SUPPORT_STATUSES.map((s) => (
            <Link
              key={s}
              href={tabHref(s, abuse)}
              aria-current={s === status ? "page" : undefined}
              title={STAFF_STATUS_WORDS[s]}
              className={`inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full px-3 text-sm sm:px-4 transition-colors duration-150 sm:min-h-9 ${s === status ? "bg-surface font-medium text-ink shadow-e1" : "text-ink-2 hover:text-ink"}`}
            >
              {TAB_WORDS[s]}
            </Link>
          ))}
        </nav>
        <Link
          href={tabHref(status, !abuse)}
          aria-pressed={abuse}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors duration-150 ${abuse ? "border-failed/35 bg-failed/[0.06] font-medium text-failed" : "border-line bg-surface text-ink-2 hover:text-ink"}`}
        >
          <FlagIcon size={15} weight={abuse ? "fill" : "regular"} aria-hidden /> {abuse ? "Abuse reports only" : "Only abuse reports"}
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ChatsCircleIcon} title={abuse ? "No abuse reports here" : "All clear"}>
          {EMPTY[status]}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/support/${r.id}`} className="group grid gap-2 px-5 py-4 transition-colors duration-150 hover:bg-canvas-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
                <span className="grid min-w-0 gap-1.5">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-[15px] font-medium text-ink">{r.subject}</span>
                    <Chip tone={r.topic === "abuse" ? "failed" : "neutral"}>
                      {r.topic === "abuse" ? <FlagIcon size={12} weight="fill" className="mr-1" aria-hidden /> : null}
                      {TOPIC_LABELS[r.topic]}
                    </Chip>
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                    <span className="break-all">{r.email}</span>
                    <span>{r.workspace ?? "No workspace"}</span>
                    <span>
                      {r.messages} {r.messages === 1 ? "message" : "messages"}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-3 text-xs text-ink-2 sm:justify-end">
                  <span className={status === "waiting_on_farbaek" ? "font-medium text-ink" : ""}>
                    {SINCE_WORDS[status]} {waitingFor(r.since, now)}
                    {status === "waiting_on_farbaek" ? "" : " ago"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <UserCircleIcon size={15} aria-hidden />
                    {r.assignee === null ? "Unassigned" : r.assignee === "you" ? "You" : r.assignee}
                  </span>
                  <CaretRightIcon size={15} className="text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
