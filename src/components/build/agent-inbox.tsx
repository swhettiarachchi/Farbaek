import { ArrowRightIcon, CheckCircleIcon, CircleNotchIcon, EyeIcon, HourglassMediumIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { RelativeTime } from "@/components/ui/local-time";
import { RUN_STATUS_LABELS } from "@/core/agent/cloud-run";
import { INBOX_LANE_LABELS, INBOX_LANES, firstSentence, type InboxLane, type ProposalState } from "@/core/agent/inbox";
import type { RunView } from "@/server/cloud-agent/store";
import { CoreMark, type CoreMarkState } from "./core-mark";

const LANE_STYLE: Record<InboxLane, { icon: Icon; tone: string; action: string }> = {
  needs_you: { icon: HourglassMediumIcon, tone: "text-approval", action: "Answer" },
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

/**
 * Mission Control's agent inbox (Phase C): recent runs by what they need from
 * the person, each with a small live Agent Core and one line on where it is.
 */
export function AgentInbox({ lanes, proposals }: { lanes: Record<InboxLane, RunView[]>; proposals: ReadonlyMap<string, ProposalState> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {INBOX_LANES.map((lane) => {
        const runs = lanes[lane];
        const style = LANE_STYLE[lane];
        return (
          <section key={lane} aria-labelledby={`lane-${lane}`} className={`rounded-md border bg-surface p-4 shadow-e1 ${lane === "needs_you" && runs.length ? "border-approval/45" : "border-line"}`}>
            <h3 id={`lane-${lane}`} className="flex items-center gap-2 text-sm font-medium">
              <style.icon size={16} weight="bold" className={`${style.tone} ${lane === "working" && runs.length ? "motion-safe:animate-spin" : ""}`} aria-hidden />
              {INBOX_LANE_LABELS[lane].title}
              <span className="ml-auto rounded-full border border-line px-2 py-px text-xs font-normal text-ink-2 tabular">{runs.length}</span>
            </h3>
            {runs.length === 0 ? (
              <p className="mt-3 text-[13px] leading-relaxed text-ink-3">{INBOX_LANE_LABELS[lane].empty}</p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {runs.map((r, i) => {
                  const proposal = r.proposalId ? (proposals.get(r.proposalId) ?? null) : null;
                  return (
                    <li key={r.id} className="motion-safe:animate-[usage-in_260ms_cubic-bezier(0.16,1,0.3,1)_both]" style={{ animationDelay: `${i * 40}ms` }}>
                      <Link href={`/app/build/${r.id}`} className="group flex gap-3 rounded-sm border border-transparent p-2 transition-colors duration-150 hover:border-line hover:bg-canvas-2/70">
                        <CoreMark state={markState(lane, r)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium group-hover:text-accent">{r.taskTitle}</span>
                          <span className="mt-0.5 block truncate text-xs text-ink-3">
                            {r.projectName} · <RelativeTime iso={r.endedAt ?? r.startedAt} />
                          </span>
                          <span className="mt-1.5 line-clamp-2 block text-[13px] leading-snug text-ink-2">{summary(lane, r, proposal)}</span>
                          <span className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${lane === "needs_you" ? "text-approval" : "text-accent"}`}>
                            {style.action} <ArrowRightIcon size={12} weight="bold" aria-hidden />
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
