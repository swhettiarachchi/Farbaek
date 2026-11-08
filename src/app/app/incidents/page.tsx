import { CaretRightIcon, MegaphoneIcon, PauseCircleIcon, SirenIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle, EmptyState, PageHeader } from "@/components/app/primitives";
import { IncidentStatusBadge, SeverityBadge } from "@/components/incidents/badges";
import { NewIncident } from "@/components/incidents/new-incident";
import { PauseControl } from "@/components/incidents/pause-control";
import { RelativeTime } from "@/components/ui/local-time";
import { checkFeature } from "@/core/billing/entitlements";
import { SOURCE_WORDS } from "@/core/trust/incidents";
import { loadAppContext } from "@/server/workspace/context";
import { INCIDENT_TOOLS_NOT_IN_PLAN, RESUME_MANAGERS_ONLY } from "@/server/workspace/incidents";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES } from "@/server/workspace/types";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Problems and pause" };

/** Incidents and the emergency pause (ADR 0083). */
export default async function IncidentsPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  const [incidents, projects] = await Promise.all([ctx.reader.listIncidents(ws.id).catch(() => null), ctx.reader.listProjects(ws.id)]);
  const demo = ctx.mode === "demo";
  const contributor = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const manager = ctx.role !== null && MANAGER_ROLES.includes(ctx.role);
  const tools = checkFeature(ws.plan, "incident_response");
  const readOnly = demo ? "The demo workspace is read-only." : null;
  const toolsReason = readOnly ?? (contributor ? null : "Viewers can read problems, but not report them.") ?? (tools.allowed ? null : tools.code === "FEATURE_NOT_IN_PLAN" ? INCIDENT_TOOLS_NOT_IN_PLAN : tools.message);

  return (
    <div className="grid gap-8">
      <PageHeader title="Problems and pause" description="What went wrong in this workspace and what was done about it, plus a button that stops every agent at once." />

      <Card>
        <CardTitle icon={PauseCircleIcon}>Emergency pause</CardTitle>
        <div className="mt-4">
          <PauseControl
            paused={ws.agentsPaused}
            pauseReason={readOnly ?? (contributor ? null : "Viewers can't pause agents. Ask someone who contributes to this workspace.")}
            resumeReason={readOnly ?? (manager ? null : RESUME_MANAGERS_ONLY)}
          />
        </div>
      </Card>

      <section aria-labelledby="incidents-title" className="grid gap-4">
        <CardTitle id="incidents-title" icon={SirenIcon}>
          Problems
        </CardTitle>
        {incidents === null ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
            <span>Problems couldn&apos;t be read just now. Reload the page to try again.</span>
          </p>
        ) : incidents.length === 0 ? (
          <EmptyState icon={SirenIcon} title="No problems">
            A problem opens here by itself when agents are paused or something you watch goes down. One also opens when a change that applied on its own fails its checks.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
            {incidents.map((i) => (
              <li key={i.id}>
                <Link href={`/app/incidents/${i.number}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors duration-150 hover:bg-canvas-2 sm:flex-nowrap sm:px-5">
                  <div className="grid min-w-0 flex-1 basis-full gap-1 sm:basis-auto">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] font-medium">
                      <span className="text-ink-3 tabular">#{i.number}</span> <span className="min-w-0">{i.title}</span>
                      {demo ? <StatusBadge status="simulated" label="Sample" /> : null}
                    </p>
                    <p className="text-xs text-ink-3">
                      {SOURCE_WORDS[i.source]}, opened <RelativeTime iso={i.openedAt} />
                    </p>
                  </div>
                  <div className="flex flex-1 flex-wrap gap-2 sm:flex-none sm:justify-end">
                    <SeverityBadge severity={i.severity} />
                    <IncidentStatusBadge status={i.status} />
                  </div>
                  <CaretRightIcon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card>
        <CardTitle icon={MegaphoneIcon}>Report a problem</CardTitle>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">For something Farbaek didn&apos;t notice on its own: a customer report, a wrong price, a change that looked fine and wasn&apos;t.</p>
        <div className="mt-4">
          <NewIncident projects={projects.filter((p) => !p.archivedAt).map((p) => ({ id: p.id, name: p.name }))} disabledReason={toolsReason} />
        </div>
      </Card>
    </div>
  );
}
