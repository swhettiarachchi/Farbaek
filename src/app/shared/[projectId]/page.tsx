import { ArrowLeftIcon, ArrowUpRightIcon, FileIcon, FilePlusIcon, FolderOpenIcon, ImageIcon, ListBulletsIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle, EmptyState, Notice, PageHeader, TaskStateBadge } from "@/components/app/primitives";
import { GuestTaskForm } from "@/components/sharing/guest-forms";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { buttonClasses } from "@/components/ui/button";
import { formatBytes } from "@/core/workspace/files";
import type { GuestAccess } from "@/core/workspace/sharing";
import { siteAddress } from "@/server/publish/config";
import { loadGuestProject } from "@/server/workspace/guest-context";
import { leaveSharedProjectAction } from "../actions";

export const metadata: Metadata = { title: "Shared project" };

const YOU_CAN: Record<GuestAccess, string> = {
  view: "You can read its files, tasks, plans and proof.",
  edit: "You can change its files and add tasks. Its workspace plans, approves and publishes the work.",
};

export default async function SharedProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guest = await loadGuestProject(projectId);
  if (!guest) notFound();
  const { project, reader, orgId } = guest;
  const [files, tasks] = await Promise.all([reader.listFiles(orgId, project.id), reader.listTasks(orgId, { projectId: project.id })]);
  const site = guest.liveSiteName ? siteAddress(guest.liveSiteName) : null;
  const canEdit = guest.writes.enabled;

  return (
    <div className="grid gap-8">
      <div>
        <Link href="/shared" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} weight="bold" aria-hidden /> Shared with you
        </Link>
        <div className="mt-3">
          <PageHeader
            title={project.name}
            description={
              <>
                {project.description ? <span className="block">{project.description}</span> : null}
                <span className="mt-1 block text-ink-3">
                  Shared by {guest.orgName}. {YOU_CAN[guest.access]}
                </span>
              </>
            }
            actions={
              site ? (
                <a href={site} target="_blank" rel="noreferrer" className={buttonClasses("secondary", "sm")}>
                  Open the live site <ArrowUpRightIcon size={16} weight="bold" aria-hidden />
                </a>
              ) : null
            }
          />
        </div>
      </div>

      {guest.access === "edit" && !canEdit ? <Notice>{guest.writes.reason}</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle icon={FolderOpenIcon}>Files</CardTitle>
            {canEdit ? (
              <Link href={`/shared/${project.id}/file?new=1`} className={buttonClasses("secondary", "sm")}>
                <FilePlusIcon size={16} weight="bold" aria-hidden /> New file
              </Link>
            ) : null}
          </div>
          {files.length === 0 ? (
            <p className="mt-3 text-sm text-ink-2">This project has no files yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {files.map((f) => (
                <li key={f.path}>
                  <Link
                    href={`/shared/${project.id}/file?path=${encodeURIComponent(f.path)}`}
                    className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm hover:text-accent"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {f.encoding === "base64" ? <ImageIcon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden /> : <FileIcon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden />}
                      <span className="truncate font-mono text-label">{f.path}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-3 tabular">{formatBytes(f.sizeBytes)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid gap-6">
          <section aria-labelledby="tasks-heading" className="grid gap-3">
            <CardTitle id="tasks-heading" icon={ListBulletsIcon}>
              Tasks
            </CardTitle>
            {tasks.length === 0 ? (
              <EmptyState icon={ListBulletsIcon} title="No tasks yet">
                {canEdit ? "Add one below. The workspace's people plan it and decide what changes." : "Tasks the workspace adds to this project appear here."}
              </EmptyState>
            ) : (
              <ul className="grid gap-2">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/shared/${project.id}/tasks/${t.id}`}
                      className="grid gap-2 rounded-md border border-line bg-surface p-4 shadow-e1 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <span className="font-medium">{t.title}</span>
                      <span>
                        <TaskStateBadge state={t.state} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {canEdit ? (
              <Card>
                <GuestTaskForm projectId={project.id} />
              </Card>
            ) : null}
          </section>

          <Card>
            <p className="text-sm text-ink-2">Leave this project when you no longer need it. Someone in its workspace can invite you again.</p>
            <div className="mt-3">
              <ConfirmAction
                action={leaveSharedProjectAction}
                fields={{ projectId: project.id }}
                trigger="Leave this project"
                question={<>Leave {project.name}? You won&apos;t be able to open it until someone invites you again.</>}
                confirmLabel="Leave project"
                pendingLabel="Leaving…"
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
