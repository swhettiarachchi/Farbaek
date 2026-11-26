import { ArrowRightIcon, ArrowUpRightIcon, CalendarCheckIcon } from "@/components/icons";
import Link from "next/link";
import { Card, CardTitle } from "@/components/app/primitives";
import { RelativeTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ScheduledOnHome } from "@/core/automation/home";
import { RUN_STATUS, STOPPED_BADGE, stateBadge } from "./status";

/**
 * Scheduled work on Home (stage 274, ADR 0281): what Farbaek will do next by itself, anything it paused, and the last thing it
 * did, in a few lines. It is only drawn for a person who has scheduled something; everything is changed on the Scheduled page.
 */
export function ScheduledHomeCard({ home }: { home: ScheduledOnHome }) {
  const { rows, more, lastRun } = home;
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <CardTitle icon={CalendarCheckIcon}>Scheduled</CardTitle>
        <Link href="/app/scheduled" className="-my-3 inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline">
          All scheduled <ArrowRightIcon size={14} weight="bold" aria-hidden />
        </Link>
      </div>
      {rows.length > 0 ? (
        <ul className="mt-2 divide-y divide-line">
          {rows.map((r) => {
            // A task waiting for its time needs no badge: its next run says so.
            const badge = r.kind === "stopped" ? STOPPED_BADGE : r.kind === "paused" ? stateBadge("paused", false) : r.when === "running" ? stateBadge("active", true) : null;
            return (
              <li key={r.id}>
                <Link href={r.href} className="group grid gap-1 py-3">
                  <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="line-clamp-2 min-w-0 text-body font-medium group-hover:text-accent">{r.title}</span>
                    {badge ? <StatusBadge status={badge.status} label={badge.label} /> : null}
                  </span>
                  <span className={`line-clamp-3 text-sm leading-relaxed ${r.kind === "stopped" ? "text-ink-2" : "text-ink-3"}`}>
                    {r.line}
                    {r.when === "later" && r.nextRunAt ? (
                      <>
                        {" "}
                        Next run <RelativeTime iso={r.nextRunAt} />.
                      </>
                    ) : r.when === "due" ? (
                      " Due now."
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-ink-3">Nothing is scheduled to run now.</p>
      )}
      {more > 0 ? <p className="border-t border-line pt-3 text-sm text-ink-3">And {more} more scheduled or paused.</p> : null}
      {lastRun ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-4 text-sm">
          <StatusBadge status={RUN_STATUS[lastRun.status].status} label={RUN_STATUS[lastRun.status].label} />
          <span className="min-w-0 text-ink-2">
            Last run: {lastRun.title}, <RelativeTime iso={lastRun.at} />.
          </span>
          {lastRun.conversationId ? (
            <Link href={`/app/chat/${lastRun.conversationId}`} className="tap inline-flex items-center gap-1 font-medium text-accent underline-offset-2 hover:underline">
              Read the answer <ArrowUpRightIcon size={14} weight="bold" aria-hidden />
            </Link>
          ) : null}
        </p>
      ) : null}
    </Card>
  );
}
