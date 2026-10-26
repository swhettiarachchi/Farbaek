import { CaretRightIcon, SirenIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/app/primitives";
import { IncidentStatusBadge, SeverityBadge } from "@/components/incidents/badges";
import { NewIncident } from "@/components/incidents/new-incident";
import { PauseControl } from "@/components/incidents/pause-control";
import { RelativeTime } from "@/components/ui/local-time";
import { checkFeature } from "@/core/billing/entitlements";
import { SOURCE_WORDS } from "@/core/trust/incidents";
import { loadAppContext } from "@/server/workspace/context";
import { INCIDENT_TOOLS_NOT_IN_PLAN, RESUME_MANAGERS_ONLY } from "@/server/workspace/incidents";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Incidents" };

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
  const toolsReason = readOnly ?? (contributor ? null : "Viewers can read incidents, but not open them.") ?? (tools.allowed ? null : tools.code === "FEATURE_NOT_IN_PLAN" ? INCIDENT_TOOLS_NOT_IN_PLAN : tools.message);

  return (
    <div className="grid gap-8">
      <PageHeader title="Incidents" description="What went wrong in this workspace, what was done about it, and what would keep it from happening again." />

      <Card>
        <h2 className="text-lg font-medium">Emergency pause</h2>
        <div className="mt-4">
          <PauseControl
            paused={ws.agentsPaused}
            pauseReason={readOnly ?? (contributor ? null : "Viewers can't pause agents. Ask someone who contributes to this workspace.")}
            resumeReason={readOnly ?? (manager ? null : RESUME_MANAGERS_ONLY)}
          />
        </div>
      </Card>

      <section aria-labelledby="incidents-title" className="grid gap-4">
        <h2 id="incidents-title" className="text-lg font-medium">
          Incidents
        </h2>
        {incidents === null ? (
          <p role="alert" className="text-sm text-failed">
            Incidents couldn&apos;t be read just now. Reload the page to try again.
          </p>
        ) : incidents.length === 0 ? (
          <EmptyState icon={SirenIcon} title="No incidents">
            One opens here on its own when a change that applied on its own fails its checks, when something you watch goes down, or when agents are paused.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
            {incidents.map((i) => (
              <li key={i.id}>
                <Link href={`/app/incidents/${i.number}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors duration-150 hover:bg-canvas-2 sm:flex-nowrap sm:px-5">
                  <div className="grid min-w-0 flex-1 basis-full gap-1 sm:basis-auto">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-medium">
                      <span className="text-ink-3 tabular">#{i.number}</span> <span className="min-w-0">{i.title}</span>
                      {demo ? <span className="rounded-full border border-dashed border-line-strong/60 px-2 text-xs font-normal text-ink-2">Sample</span> : null}
                    </p>
                    <p className="text-xs text-ink-3">
                      {SOURCE_WORDS[i.source]}, opened <RelativeTime iso={i.openedAt} />
                    </p>
                  </div>
                  <div className="flex flex-1 flex-wrap gap-2 sm:flex-none sm:justify-end">
                    <SeverityBadge severity={i.severity} />
                    <IncidentStatusBadge status={i.status} />
                  </div>
                  <CaretRightIcon size={16} className="shrink-0 text-ink-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card>
        <h2 className="text-lg font-medium">Open an incident</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">For something Farbaek didn&apos;t notice on its own: a customer report, a wrong price, a change that looked fine and wasn&apos;t.</p>
        <div className="mt-4">
          <NewIncident projects={projects.filter((p) => !p.archivedAt).map((p) => ({ id: p.id, name: p.name }))} disabledReason={toolsReason} />
        </div>
      </Card>
    </div>
  );
}
