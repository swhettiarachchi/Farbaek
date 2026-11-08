import { ArrowLeftIcon, ChartBarIcon, GraphIcon, ListBulletsIcon, ShieldWarningIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardTitle, EmptyState, PageHeader } from "@/components/app/primitives";
import { GraphAnalyticsView } from "@/components/insights/graph-analytics";
import { LaneGraph } from "@/components/insights/lane-graph";
import { ProjectLoom } from "@/components/insights/project-loom";
import { RelativeTime } from "@/components/ui/local-time";
import { buttonClasses } from "@/components/ui/button";
import { buildLanes, graphAnalytics } from "@/core/insights/project-graph";
import { GRAPH_LIMITS } from "@/server/insights/project-graph";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Project map" };

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
          <ArrowLeftIcon size={14} weight="bold" aria-hidden /> {project.name}
        </Link>
        <div className="mt-3">
          <PageHeader title="Project map" description="Every task, from what was asked to what's live, with the proof between. Each step links to its record." />
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
          Each task you start here becomes a lane: its plan, the change, the checks that proved it, and the version that went live.
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="totals-heading" className="grid gap-4">
            <CardTitle id="totals-heading" icon={ChartBarIcon}>
              What it adds up to
            </CardTitle>
            <GraphAnalyticsView a={analytics} />
          </section>

          <section aria-labelledby="lanes-heading" className="grid gap-4">
            <div className="grid gap-1">
              <CardTitle id="lanes-heading" icon={ListBulletsIcon}>
                Every task
              </CardTitle>
              <p className="text-sm text-ink-2">
                {records.truncated ? `The ${GRAPH_LIMITS.tasks} newest tasks, newest first.` : "Newest first."} A solid line means the work got there; a dashed one, that it hasn&apos;t yet.
              </p>
            </div>
            <ProjectLoom lanes={lanes} />
            <LaneGraph lanes={lanes} />
          </section>

          {unverifiedReleases.length ? (
            <section aria-labelledby="unverified-heading" className="grid gap-3 rounded-md border border-caution/35 bg-surface p-5 shadow-e1 sm:p-6">
              {/* A callout's title carries its kind's icon in its colour (ADR 0183): this one asks for a look. */}
              <h2 id="unverified-heading" className="flex items-center gap-2.5 text-base font-medium">
                <ShieldWarningIcon size={20} weight="fill" className="shrink-0 text-caution" aria-hidden />
                <span className="min-w-0">Published without passed checks</span>
              </h2>
              <ul className="grid gap-3">
                {unverifiedReleases.map((r) => (
                  <li key={r.number} className="grid gap-0.5 text-sm">
                    <Link href={`/app/projects/${project.id}/launch#version-${r.number}`} className="font-medium hover:text-accent hover:underline">
                      Version {r.number}
                      {r.live ? ", live now" : ""}
                    </Link>
                    <span className="text-ink-2">
                      Published <RelativeTime iso={r.createdAt} />. {r.reason ? `Reason given: ${r.reason}` : "Published before proof was recorded."}
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
