import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  DesktopIcon,
  EyeIcon,
  HandPalmIcon,
  NotePencilIcon,
  PlayIcon,
  ScalesIcon,
  ShieldCheckIcon,
  SirenIcon,
  WarningIcon,
  XCircleIcon,
  ArrowCounterClockwiseIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/app/primitives";
import { IncidentStatusBadge, SeverityBadge } from "@/components/incidents/badges";
import { IncidentTools } from "@/components/incidents/incident-tools";
import { PauseControl } from "@/components/incidents/pause-control";
import { ReplayTheatre } from "@/components/incidents/replay-theatre";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { checkFeature } from "@/core/billing/entitlements";
import { EVENT_WORDS, SOURCE_WORDS, replayIncident, suggestPreventionRules, type IncidentEventKind } from "@/core/trust/incidents";
import { loadAppContext } from "@/server/workspace/context";
import { INCIDENT_TOOLS_NOT_IN_PLAN, RESUME_MANAGERS_ONLY } from "@/server/workspace/incidents";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES } from "@/server/workspace/types";
import { RULES_NOT_IN_PLAN } from "@/server/workspace/workspace-rules";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Problem" };

const EVENT_ICON: Record<IncidentEventKind, { icon: Icon; className: string }> = {
  opened: { icon: SirenIcon, className: "text-failed" },
  note: { icon: NotePencilIcon, className: "text-ink-2" },
  severity: { icon: WarningIcon, className: "text-approval" },
  status: { icon: ShieldCheckIcon, className: "text-accent" },
  check_failed: { icon: XCircleIcon, className: "text-failed" },
  recovered: { icon: CheckCircleIcon, className: "text-verified" },
  paused: { icon: HandPalmIcon, className: "text-failed" },
  resumed: { icon: PlayIcon, className: "text-verified" },
  prevention: { icon: ScalesIcon, className: "text-accent" },
  resolved: { icon: CheckCircleIcon, className: "text-verified" },
};

/** One incident (ADR 0083): what happened, containment, the replay and the timeline. */
export default async function IncidentPage({ params }: { params: Promise<{ number: string }> }) {
  const number = Number((await params).number);
  if (!Number.isInteger(number) || number < 1 || number > 1_000_000) notFound();
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  const found = await ctx.reader.getIncident(ws.id, number);
  if (!found) notFound();
  const { incident, events } = found;
  const [linked, project] = await Promise.all([
    ctx.reader.getIncidentChanges(ws.id, number).catch(() => ({ changes: [], exact: false })),
    incident.projectId ? ctx.reader.getProject(ws.id, incident.projectId) : Promise.resolve(null),
  ]);
  const suggestions = suggestPreventionRules(linked.changes, number);
  const steps = replayIncident(linked.changes, suggestions);
  const taskId = linked.exact ? linked.changes[0]?.taskId : undefined;

  const demo = ctx.mode === "demo";
  const contributor = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const manager = ctx.role !== null && MANAGER_ROLES.includes(ctx.role);
  const readOnly = demo ? "The demo workspace is read-only." : null;
  const tools = checkFeature(ws.plan, "incident_response");
  const builder = checkFeature(ws.plan, "policy_builder");
  const who = (actor: string | null) => (actor === null ? "Farbaek" : actor === ctx.user.id ? "You" : "A teammate");

  return (
    <div className="grid gap-8">
      <div className="grid gap-4">
        <Link href="/app/incidents" className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} aria-hidden /> All problems
        </Link>
        <PageHeader
          title={`#${incident.number} ${incident.title}`}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={incident.severity} />
              <IncidentStatusBadge status={incident.status} />
              {demo ? <StatusBadge status="simulated" label="Sample" /> : null}
              <span className="text-sm text-ink-3">
                {SOURCE_WORDS[incident.source]}, opened <RelativeTime iso={incident.openedAt} />
                {project ? (
                  <>
                    {" "}
                    in{" "}
                    <Link href={`/app/projects/${project.id}`} className="font-medium text-accent hover:underline">
                      {project.name}
                    </Link>
                  </>
                ) : null}
              </span>
            </span>
          }
        />
      </div>

      {incident.status === "resolved" ? (
        <Card>
          <p className="flex items-start gap-2.5 text-[0.9375rem] leading-relaxed">
            <CheckCircleIcon size={20} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            <span>
              <span className="font-medium">Resolved {incident.resolvedAt ? <RelativeTime iso={incident.resolvedAt} /> : null}.</span> {incident.outcome}
            </span>
          </p>
        </Card>
      ) : (
        <Card>
          <h2 className="text-lg font-medium">Contain it</h2>
          <div className="mt-4">
            <PauseControl
              paused={ws.agentsPaused}
              pauseReason={readOnly ?? (contributor ? null : "Viewers can't pause agents. Ask someone who contributes to this workspace.")}
              resumeReason={readOnly ?? (manager ? null : RESUME_MANAGERS_ONLY)}
            />
          </div>
          <ul className="mt-6 grid gap-1 border-t border-line pt-4">
            {taskId ? (
              <li>
                <Link href={`/app/tasks/${taskId}`} className="flex min-h-11 items-center gap-2.5 text-sm hover:underline">
                  <ArrowCounterClockwiseIcon size={16} className="shrink-0 text-ink-2" aria-hidden /> Undo the change, file by file, from its task
                  <ArrowRightIcon size={14} className="ml-auto shrink-0 text-ink-3" aria-hidden />
                </Link>
              </li>
            ) : null}
            <li>
              <Link href="/app/agents" className="flex min-h-11 items-center gap-2.5 text-sm hover:underline">
                <DesktopIcon size={16} className="shrink-0 text-ink-2" aria-hidden /> Revoke a desktop agent you don&apos;t trust
                <ArrowRightIcon size={14} className="ml-auto shrink-0 text-ink-3" aria-hidden />
              </Link>
            </li>
            {project ? (
              <li>
                <Link href={`/app/projects/${project.id}/launch`} className="flex min-h-11 items-center gap-2.5 text-sm hover:underline">
                  <EyeIcon size={16} className="shrink-0 text-ink-2" aria-hidden /> Watch what&apos;s live for {project.name} every hour
                  <ArrowRightIcon size={14} className="ml-auto shrink-0 text-ink-3" aria-hidden />
                </Link>
              </li>
            ) : null}
          </ul>
        </Card>
      )}

      <Card>
        <ReplayTheatre
          number={incident.number}
          steps={steps}
          suggestions={suggestions}
          exact={linked.exact}
          builderReason={builder.allowed ? null : builder.code === "FEATURE_NOT_IN_PLAN" ? RULES_NOT_IN_PLAN : builder.message}
        />
      </Card>

      <Card>
        <h2 className="text-lg font-medium">Timeline</h2>
        <ol className="mt-4 grid gap-4">
          {events.map((e) => {
            const { icon: EventIcon, className } = EVENT_ICON[e.kind];
            return (
              <li key={e.id} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-raised">
                  <EventIcon size={16} weight="bold" className={className} aria-hidden />
                </span>
                <div className="grid min-w-0 gap-0.5">
                  <p className="text-sm">
                    <span className="font-medium">{EVENT_WORDS[e.kind]}</span>
                    <span className="text-ink-3">
                      {" "}
                      by {who(e.actor)}, <LocalTime iso={e.at} />
                    </span>
                  </p>
                  {e.text ? <p className="whitespace-pre-line text-sm leading-relaxed text-ink-2">{e.text}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      {incident.status !== "resolved" ? (
        <Card>
          <h2 className="text-lg font-medium">Work on it</h2>
          <div className="mt-4">
            <IncidentTools
              number={incident.number}
              severity={incident.severity}
              status={incident.status}
              toolsReason={readOnly ?? (contributor ? null : "Viewers can read problems, but not change them.") ?? (tools.allowed ? null : tools.code === "FEATURE_NOT_IN_PLAN" ? INCIDENT_TOOLS_NOT_IN_PLAN : tools.message)}
              resolveReason={readOnly ?? (contributor ? null : "Viewers can read problems, but not resolve them.")}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
