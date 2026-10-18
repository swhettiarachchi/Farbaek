import { ArrowLeftIcon, ArrowRightIcon, DownloadSimpleIcon, FolderOpenIcon, ListChecksIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateTaskForm } from "@/components/app/forms";
import { PreviewButton } from "@/components/app/preview-button";
import { previewUnavailableReason, readSandboxConfig } from "@/server/sandbox/config";
import { ArchiveProject } from "@/components/app/archive-project";
import { LocalTime } from "@/components/ui/local-time";
import { MANAGER_ROLES } from "@/server/workspace/types";
import { Card, EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { TaskList } from "@/components/app/task-list";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { formatBytes } from "@/core/workspace/files";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  const starterFailed = (await searchParams).starter === "failed";
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const project = await ctx.reader.getProject(ctx.current.id, projectId);
  if (!project) notFound();
  const [tasks, files] = await Promise.all([ctx.reader.listTasks(ctx.current.id, { projectId: project.id }), ctx.reader.listFiles(ctx.current.id, project.id)]);
  const filesBytes = files.reduce((n, f) => n + f.sizeBytes, 0);
  const previewReason = ctx.mode === "demo" ? "Previews need a real workspace." : previewUnavailableReason(readSandboxConfig());

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

      {starterFailed ? (
        <Notice tone="warning">The project was created, but the starter&apos;s files couldn&apos;t be added. Import files from the Files page, or create the project again.</Notice>
      ) : null}

      {project.archivedAt ? (
        <Notice tone="warning">
          Archived <LocalTime iso={project.archivedAt} />. This project is read-only: its files, tasks and evidence stay readable, and it doesn&apos;t count toward your plan&apos;s
          project limit.
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <section aria-labelledby="tasks-heading" className="grid gap-4">
          <h2 id="tasks-heading" className="text-lg font-medium">
            Tasks <span className="text-ink-3 tabular">{tasks.length}</span>
          </h2>
          {tasks.length === 0 ? (
            <EmptyState icon={ListChecksIcon} title="No tasks in this project">
              Describe one outcome. The task starts at Received, then you agree an intent contract before any change is planned.
            </EmptyState>
          ) : (
            <TaskList tasks={tasks} showProject={false} />
          )}
        </section>

        <div className="grid gap-6">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <FolderOpenIcon size={20} className="text-ink-3" aria-hidden /> Files
            </h2>
            {files.length > 0 ? (
              <Link href={`/app/projects/${project.id}/files`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
                Open <ArrowRightIcon size={14} aria-hidden />
              </Link>
            ) : null}
          </div>
          {files.length > 0 ? (
            <>
              <p className="mt-2 text-sm text-ink-2">
                <span className="tabular">{files.length.toLocaleString("en-US")}</span> {files.length === 1 ? "file" : "files"} · <span className="tabular">{formatBytes(filesBytes)}</span>
              </p>
              <div className="mt-4 flex flex-wrap items-start gap-3">
                <PreviewButton projectId={project.id} disabledReason={previewReason} variant="primary" />
                <a href={`/app/projects/${project.id}/download`} download className={buttonClasses("secondary", "sm")}>
                  <DownloadSimpleIcon size={16} aria-hidden /> Download .zip
                </a>
              </div>
              {!previewReason && !files.some((f) => f.path === "index.html") ? (
                <p className="mt-3 text-xs text-ink-3">Previews serve the project&apos;s files as they are, starting at index.html. Apps that need building preview from a sandbox.</p>
              ) : null}
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-ink-2">Import the project&apos;s source so tasks can work against real files.</p>
              <div className="mt-4">
                <ButtonLink href={`/app/projects/${project.id}/files`} size="sm" variant="secondary">
                  Import files
                </ButtonLink>
              </div>
            </>
          )}
        </Card>
        <Card>
          <h2 className="text-lg font-medium">New task</h2>
          <div className="mt-4">
            <CreateTaskForm
              projectId={project.id}
              disabledReason={!ctx.writes.enabled ? ctx.writes.reason : project.archivedAt ? "This project is archived, so new tasks can't be added." : null}
            />
          </div>
        </Card>
        {!project.archivedAt ? (
          <Card>
            <h2 className="text-lg font-medium">Archive</h2>
            <p className="mt-1 text-sm text-ink-2">Take a finished or paused project out of the list. Nothing is deleted.</p>
            <div className="mt-4">
              <ArchiveProject
                projectId={project.id}
                name={project.name}
                disabledReason={
                  !ctx.writes.enabled ? ctx.writes.reason : ctx.role && MANAGER_ROLES.includes(ctx.role) ? null : "Only owners and admins can archive a project."
                }
              />
            </div>
          </Card>
        ) : null}
        </div>
      </div>
    </div>
  );
}
