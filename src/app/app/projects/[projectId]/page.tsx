import { ArrowLeftIcon, ListChecksIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateTaskForm } from "@/components/app/forms";
import { Card, EmptyState, PageHeader } from "@/components/app/primitives";
import { TaskList } from "@/components/app/task-list";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const project = await ctx.reader.getProject(ctx.current.id, projectId);
  if (!project) notFound();
  const tasks = await ctx.reader.listTasks(ctx.current.id, { projectId: project.id });

  return (
    <div className="grid gap-8">
      <div>
        <Link href="/app/projects" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} aria-hidden /> Projects
        </Link>
        <div className="mt-3">
          <PageHeader title={project.name} description={project.description ?? undefined} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <section aria-labelledby="tasks-heading" className="grid gap-4">
          <h2 id="tasks-heading" className="text-lg font-medium">
            Tasks <span className="text-ink-3 tabular">{tasks.length}</span>
          </h2>
          {tasks.length === 0 ? (
            <EmptyState icon={ListChecksIcon} title="No tasks in this project">
              Describe one outcome. The task starts at Received; contracts and plans arrive with Studio in Stage 2.
            </EmptyState>
          ) : (
            <TaskList tasks={tasks} showProject={false} />
          )}
        </section>

        <Card>
          <h2 className="text-lg font-medium">New task</h2>
          <div className="mt-4">
            <CreateTaskForm projectId={project.id} disabledReason={ctx.writes.enabled ? null : ctx.writes.reason} />
          </div>
        </Card>
      </div>
    </div>
  );
}
