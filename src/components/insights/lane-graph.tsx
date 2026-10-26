import { CheckCircleIcon, CircleDashedIcon, ClockIcon, MinusCircleIcon, SirenIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { STAGES, STAGE_TITLES, type Lane, type StageNode, type StageState } from "@/core/insights/project-graph";
import { RelativeTime } from "@/components/ui/local-time";

const STATE: Record<StageState, { icon: typeof CheckCircleIcon; tone: string; words: string }> = {
  reached: { icon: CheckCircleIcon, tone: "text-verified", words: "Done" },
  waiting: { icon: ClockIcon, tone: "text-approval", words: "Waiting" },
  stopped: { icon: MinusCircleIcon, tone: "text-ink-3", words: "Stopped" },
  failed: { icon: XCircleIcon, tone: "text-failed", words: "Failed" },
  not_yet: { icon: CircleDashedIcon, tone: "text-ink-3", words: "Not yet" },
};

/** The line from a stage to the next: solid where the work got there, dashed where it hasn't yet. Decorative; the nodes say it in words. */
function Connector({ next, delay }: { next: StageState; delay: number }) {
  const line = next === "not_yet" ? "border-dashed border-line-strong/50" : next === "reached" ? "border-solid border-accent/70" : "border-solid border-line-strong";
  return (
    <>
      <span
        aria-hidden
        className={`pointer-events-none absolute left-0 top-[21px] hidden w-[calc(100%+1rem)] origin-left border-t-2 md:block motion-safe:md:animate-[steps-fill_520ms_cubic-bezier(0.16,1,0.3,1)_both] ${line}`}
        style={{ animationDelay: `${delay}ms` }}
      />
      <span aria-hidden className={`pointer-events-none absolute bottom-[-12px] left-[22px] top-[44px] border-l-2 md:hidden ${line}`} />
    </>
  );
}

function Node({ stage }: { stage: StageNode }) {
  const s = STATE[stage.state];
  const Icon = s.icon;
  const pill = `relative z-10 inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border bg-surface px-3.5 text-sm transition-[border-color,box-shadow,transform] duration-200 ${
    stage.state === "not_yet" ? "border-dashed border-line-strong/50 text-ink-3" : "border-line text-ink shadow-e1"
  } ease-[cubic-bezier(0.16,1,0.3,1)]`;
  const inner = (
    <>
      <Icon size={18} weight={stage.state === "not_yet" ? "regular" : "fill"} className={`shrink-0 ${s.tone}`} aria-hidden />
      <span className="truncate">
        {/* The column header names the stage from md up; on phones the pill does. */}
        <span className="text-ink-3 md:sr-only">{STAGE_TITLES[stage.key]}: </span>
        {stage.label}
      </span>
      <span className="sr-only">({s.words})</span>
    </>
  );
  return (
    <div className="grid min-w-0 justify-items-start gap-1">
      {stage.href ? (
        <Link href={stage.href} className={`${pill} hover:-translate-y-px hover:border-accent/50 hover:shadow-e2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}>
          {inner}
        </Link>
      ) : (
        <span className={pill}>{inner}</span>
      )}
      {stage.detail || stage.at ? (
        <span className="max-w-full pl-11 text-xs leading-relaxed text-ink-3 md:pl-0">
          {stage.detail}
          {stage.detail && stage.at ? ". " : null}
          {stage.at ? <RelativeTime iso={stage.at} /> : null}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A project's tasks as lanes from the ask to what's live (ADR 0089). On
 * phones each lane is a vertical path; from md up the stages line up in
 * columns under one header. Every node that has a record links to it.
 */
export function LaneGraph({ lanes }: { lanes: Lane[] }) {
  return (
    <div className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
      <div className="rounded-md bg-surface shadow-e1">
        <div aria-hidden className="z-20 hidden grid-cols-[minmax(12rem,1.15fr)_repeat(5,minmax(0,1fr))] gap-x-4 rounded-t-md border-b border-line bg-surface/90 px-5 py-3 text-xs font-medium text-ink-2 backdrop-blur-xl md:sticky md:top-14 md:grid lg:top-0">
          <span>Task</span>
          {STAGES.map((s) => (
            <span key={s}>{STAGE_TITLES[s]}</span>
          ))}
        </div>
        <ol className="divide-y divide-line" aria-label="Tasks, newest first">
          {lanes.map((lane, i) => (
            <li
              key={lane.taskId}
              className="grid gap-4 p-5 motion-safe:animate-[usage-in_260ms_cubic-bezier(0.16,1,0.3,1)_both] md:grid-cols-[minmax(12rem,1.15fr)_minmax(0,5fr)] md:items-start md:gap-x-4"
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
            >
              <div className="grid min-w-0 content-start gap-1.5">
                <h3 className="text-[15px] font-medium leading-snug">
                  <Link href={`/app/tasks/${lane.taskId}`} className="-my-3 inline-block py-3 hover:text-accent hover:underline">
                    {lane.title}
                  </Link>
                </h3>
                <span className="text-xs text-ink-3">
                  Asked <RelativeTime iso={lane.createdAt} />
                </span>
                {lane.incidents.length ? (
                  <ul className="mt-1 grid gap-1">
                    {lane.incidents.map((incident) => (
                      <li key={incident.number}>
                        <Link href={`/app/incidents/${incident.number}`} className="inline-flex min-h-11 items-center gap-1.5 text-left text-xs font-medium text-failed hover:underline">
                          <SirenIcon size={14} weight="bold" className="shrink-0" aria-hidden /> Incident {incident.number}: {incident.title} ({incident.status})
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <ol aria-label={`${lane.title}, from the ask to live`} className="grid gap-3 md:grid-cols-5 md:gap-4">
                {lane.stages.map((stage, j) => (
                  <li key={stage.key} className="relative">
                    {j < lane.stages.length - 1 ? <Connector next={lane.stages[j + 1]!.state} delay={Math.min(i, 10) * 40 + j * 90} /> : null}
                    <Node stage={stage} />
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
