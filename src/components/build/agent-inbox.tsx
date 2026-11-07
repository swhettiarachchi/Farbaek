import { ArrowRightIcon, ChatCircleDotsIcon, CheckCircleIcon, CircleNotchIcon, EyeIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { RelativeTime } from "@/components/ui/local-time";
import { RUN_STATUS_LABELS } from "@/core/agent/cloud-run";
import { INBOX_LANE_LABELS, INBOX_LANES, firstSentence, type InboxLane, type ProposalState } from "@/core/agent/inbox";
import type { RunView } from "@/server/cloud-agent/store";
import { CoreMark, type CoreMarkState } from "./core-mark";

const LANE_STYLE: Record<InboxLane, { icon: Icon; tone: string; action: string }> = {
  // The lane's action names its icon: a question to answer is a speech bubble (ADR 0180).
  needs_you: { icon: ChatCircleDotsIcon, tone: "text-approval", action: "Answer" },
  working: { icon: CircleNotchIcon, tone: "text-accent", action: "Watch" },
  review: { icon: EyeIcon, tone: "text-accent", action: "Review" },
  done: { icon: CheckCircleIcon, tone: "text-ink-3", action: "Open" },
};

function markState(lane: InboxLane, run: RunView): CoreMarkState {
  if (lane === "needs_you") return "waiting";
  if (lane === "working") return "working";
  if (lane === "review") return "review";
  return run.status === "finished" ? "done" : "stopped";
}

function summary(lane: InboxLane, run: RunView, proposal: ProposalState | null): string {
  switch (lane) {
    case "needs_you":
      return "Waiting for you to approve a command before it carries on.";
    case "working":
      return run.steps > 0 ? `Working, step ${run.steps}.` : "Getting ready.";
    case "review":
      return proposal === "blocked"
        ? "Its change was stopped by the plan's checks. Open it to see why."
        : (firstSentence(run.finish?.summary) ?? "The change is ready for your review.");
    case "done":
      if (proposal === "applied") return firstSentence(run.finish?.summary) ?? "Applied to the project.";
      return firstSentence(run.outcome) ?? RUN_STATUS_LABELS[run.status];
  }
}

/** The done lane shows this many; the rest are on the Build page. */
const DONE_SHOWN = 4;

/**
 * Mission Control's agent inbox (Phase C): recent runs by what they need from
 * the person, each with a small live Agent Core and one line on where it is.
 * A summary row counts every lane; only lanes with runs open below it, two
 * to a row, so titles have room to read.
 */
export function AgentInbox({ lanes, proposals }: { lanes: Record<InboxLane, RunView[]>; proposals: ReadonlyMap<string, ProposalState> }) {
  const open = INBOX_LANES.filter((lane) => lanes[lane].length > 0);
  return (
    <div className="grid gap-4">
      <ul className="flex flex-wrap gap-2" aria-label="Runs by what they need">
        {INBOX_LANES.map((lane) => {
          const style = LANE_STYLE[lane];
          const count = lanes[lane].length;
          return (
            <li
              key={lane}
              title={count === 0 ? INBOX_LANE_LABELS[lane].empty : undefined}
              className={`inline-flex min-h-9 items-center gap-2 rounded-full border bg-surface px-3.5 text-sm shadow-e1 ${
                lane === "needs_you" && count ? "border-approval/45 text-ink" : count ? "border-line text-ink" : "border-line text-ink-3"
              }`}
            >
              <style.icon size={15} weight="bold" className={`${count ? style.tone : "text-ink-3"} ${lane === "working" && count ? "motion-safe:animate-spin" : ""}`} aria-hidden />
              {INBOX_LANE_LABELS[lane].title}
              <span className="tabular font-medium">{count}</span>
            </li>
          );
        })}
      </ul>
      <div className={`grid gap-4 ${open.length > 1 ? "lg:grid-cols-2" : ""}`}>
      {open.map((lane) => {
        const all = lanes[lane];
        const runs = lane === "done" ? all.slice(0, DONE_SHOWN) : all;
        const style = LANE_STYLE[lane];
        return (
          <section key={lane} aria-labelledby={`lane-${lane}`} className={`rounded-md border bg-surface p-4 shadow-e1 ${lane === "needs_you" ? "border-approval/45" : "border-line"}`}>
            <h3 id={`lane-${lane}`} className="flex items-center gap-2 text-sm font-medium">
              <style.icon size={16} weight="bold" className={`${style.tone} ${lane === "working" ? "motion-safe:animate-spin" : ""}`} aria-hidden />
              {INBOX_LANE_LABELS[lane].title}
              <span className="ml-auto rounded-full border border-line px-2 py-px text-xs font-normal text-ink-2 tabular">{all.length}</span>
            </h3>
              <ul className="mt-3 grid gap-1.5">
                {runs.map((r, i) => {
                  const proposal = r.proposalId ? (proposals.get(r.proposalId) ?? null) : null;
                  return (
                    <li key={r.id} className="motion-safe:animate-[usage-in_260ms_cubic-bezier(0.16,1,0.3,1)_both]" style={{ animationDelay: `${i * 40}ms` }}>
                      <Link href={`/app/build/${r.id}`} className="group flex gap-3 rounded-sm border border-transparent p-2 transition-colors duration-150 hover:border-line hover:bg-canvas-2/70">
                        <CoreMark state={markState(lane, r)} />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-[0.875rem] font-medium group-hover:text-accent">{r.taskTitle}</span>
                          <span className="mt-0.5 block truncate text-xs text-ink-3">
                            {r.projectName} · <RelativeTime iso={r.endedAt ?? r.startedAt} />
                          </span>
                          <span className="mt-1.5 line-clamp-2 block text-[0.8125rem] leading-snug text-ink-2">{summary(lane, r, proposal)}</span>
                          <span className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${lane === "needs_you" ? "text-approval" : "text-accent"}`}>
                            {style.action} <ArrowRightIcon size={12} weight="bold" aria-hidden />
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            {all.length > runs.length ? (
              <Link href="/app/build" className="mt-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm text-accent hover:underline">
                {all.length - runs.length} more on the Build page <ArrowRightIcon size={13} aria-hidden />
              </Link>
            ) : null}
          </section>
        );
      })}
      </div>
    </div>
  );
}
