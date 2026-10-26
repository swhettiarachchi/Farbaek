import { ArrowLeftIcon, GraphIcon, ShieldWarningIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { GraphAnalyticsView } from "@/components/insights/graph-analytics";
import { LaneGraph } from "@/components/insights/lane-graph";
import { RelativeTime } from "@/components/ui/local-time";
import { buttonClasses } from "@/components/ui/button";
import { buildLanes, graphAnalytics } from "@/core/insights/project-graph";
import { GRAPH_LIMITS } from "@/server/insights/project-graph";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Project graph" };

/** A project's tasks from the ask to what's live, and what they add up to (ADR 0089). */
export default async function ProjectGraphPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const project = await ctx.reader.getProject(ctx.current.id, projectId);
  if (!project) notFound();

  const records = await ctx.reader.getProjectGraph(ctx.current.id, project.id);
  const { lanes, unverifiedReleases } = buildLanes(records);
  const analytics = graphAnalytics(records);

  return (
    <div className="grid gap-8">
      <div>
        <Link href={`/app/projects/${project.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} aria-hidden /> {project.name}
        </Link>
        <div className="mt-3">
          <PageHeader title="Project graph" description="Every task, from what was asked to what's live, with the evidence between. Each step links to its record." />
        </div>
      </div>

      {lanes.length === 0 ? (
        <EmptyState
          icon={GraphIcon}
          title="No tasks in this project yet"
          action={
            <Link href={`/app/projects/${project.id}`} className={buttonClasses("primary", "sm")}>
              Describe a change
            </Link>
          }
        >
          Each task you start here becomes a lane: its contract, the change, the checks that proved it, and the version that went live.
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="totals-heading" className="grid gap-4">
            <h2 id="totals-heading" className="text-lg font-medium">
              What it adds up to
            </h2>
            <GraphAnalyticsView a={analytics} />
          </section>

          <section aria-labelledby="lanes-heading" className="grid gap-4">
            <div className="grid gap-1">
              <h2 id="lanes-heading" className="text-lg font-medium">
                Every task
              </h2>
              <p className="text-sm text-ink-2">
                {records.truncated ? `The ${GRAPH_LIMITS.tasks} newest tasks, newest first.` : "Newest first."} A solid line means the work got there; a dashed one, that it hasn&apos;t yet.
              </p>
            </div>
            <LaneGraph lanes={lanes} />
          </section>

          {unverifiedReleases.length ? (
            <section aria-labelledby="unverified-heading" className="grid gap-3 rounded-md border border-approval/40 bg-surface p-5 shadow-e1 sm:p-6">
              <h2 id="unverified-heading" className="flex items-center gap-2 text-base font-medium">
                <ShieldWarningIcon size={18} weight="bold" className="text-approval" aria-hidden /> Published without verified evidence
              </h2>
              <ul className="grid gap-3">
                {unverifiedReleases.map((r) => (
                  <li key={r.number} className="grid gap-0.5 text-sm">
                    <Link href={`/app/projects/${project.id}/launch#version-${r.number}`} className="font-medium hover:text-accent hover:underline">
                      Version {r.number}
                      {r.live ? ", live now" : ""}
                    </Link>
                    <span className="text-ink-2">
                      Published <RelativeTime iso={r.createdAt} />. {r.reason ? `Reason given: ${r.reason}` : "Published before evidence was recorded."}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
