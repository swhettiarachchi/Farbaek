import { ArchiveIcon, ArrowLeftIcon, ArrowRightIcon, DownloadSimpleIcon, EyeIcon, FolderOpenIcon, GraphIcon, ListChecksIcon, RocketLaunchIcon, ShieldCheckIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateTaskForm } from "@/components/app/forms";
import { PromptComposer } from "@/components/build/prompt-composer";
import { StaticPreview } from "@/components/preview/static-preview";
import { PublishPanel } from "@/components/publish/publish-panel";
import { ProjectSkills, type ProjectSkillView } from "@/components/skills/project-skills";
import { skillPinStatus } from "@/core/agent/skill-pins";
import { isProjectSkillPath, parseSkill } from "@/core/agent/skills";
import { loadPublishPanel } from "@/server/publish/panel";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import { runProfile } from "@/content/starters";
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
import { withheldFor } from "@/core/workspace/permissions";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  const query = await searchParams;
  const starterFailed = query.starter === "failed";
  const rescueFailed = query.rescue === "import_failed";
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const project = await ctx.reader.getProject(ctx.current.id, projectId);
  if (!project) notFound();
  const [tasks, files] = await Promise.all([ctx.reader.listTasks(ctx.current.id, { projectId: project.id }), ctx.reader.listFiles(ctx.current.id, project.id)]);
  const filesBytes = files.reduce((n, f) => n + f.sizeBytes, 0);
  const previewReason = ctx.mode === "demo" ? "Previews need a real workspace." : previewUnavailableReason(readSandboxConfig());
  // Static sites preview instantly in a locked-down frame; apps with a server use the sandbox preview.
  const isStatic = runProfile(files.map((f) => f.path)).kind === "static" && filesBytes <= 3 * 1024 * 1024;
  const contents = isStatic ? await ctx.reader.getProjectContents(ctx.current.id, project.id).catch(() => null) : null;
  const canChange = ctx.mode === "live" && ctx.writes.enabled && !project.archivedAt;
  const user = ctx.mode === "live" ? await createSupabaseServerClient() : null;
  const publish = user ? await loadPublishPanel(ctx, user, project).catch(() => null) : null;
  // The project's own skills (ADR 0030), read from their SKILL.md files, each with its approval (ADR 0043).
  const [skillFiles, skillPins] = await Promise.all([
    Promise.all(files.filter((f) => isProjectSkillPath(f.path)).slice(0, 10).map((f) => ctx.reader.getFile(ctx.current!.id, project.id, f.path).catch(() => null))),
    ctx.reader.listSkillPins(ctx.current.id, project.id).catch(() => []),
  ]);
  const skills: ProjectSkillView[] = (
    await Promise.all(
      skillFiles.map(async (f): Promise<ProjectSkillView | null> => {
        const parsed = f ? parseSkill(f.content, f.path.split("/")[2] ?? "skill", "project") : null;
        if (!parsed || !f) return null;
        const pin = skillPins.find((p) => p.path === f.path);
        const sha256 = files.find((x) => x.path === f.path)?.sha256 ?? "";
        const status = skillPinStatus({ sha256 }, pin);
        return {
          ...parsed,
          path: f.path,
          revision: f.revision,
          sha256,
          content: f.content,
          status,
          pin: pin ? { revision: pin.revision, sha256: pin.sha256, pinnedAt: pin.pinnedAt, by: pin.pinnedBy === null ? "before" : pin.pinnedBy === ctx.user.id ? "you" : "teammate" } : null,
          approvedContent: pin && status === "changed" ? await ctx.reader.getFileRevision(ctx.current!.id, project.id, f.path, pin.revision) : null,
        };
      }),
    )
  ).filter((s): s is ProjectSkillView => s !== null);
  const publishReason = !canChange ? (project.archivedAt ? "This project is archived." : ctx.writes.enabled ? null : ctx.writes.reason) : ctx.role && CONTRIBUTOR_ROLES.includes(ctx.role) ? null : "Your role can view this project but not publish it.";

  return (
    <div className="grid gap-8">
      <div>
        <Link href="/app/projects" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} aria-hidden /> Projects
        </Link>
        <div className="mt-3">
          <PageHeader
            title={project.name}
            description={project.description ?? undefined}
            actions={
              <div className="flex flex-wrap gap-2">
                <Link href={`/app/projects/${project.id}/graph`} className={buttonClasses("secondary", "sm")}>
                  <GraphIcon size={16} aria-hidden /> Project graph
                </Link>
                <Link href={`/app/projects/${project.id}/launch`} className={buttonClasses("secondary", "sm")}>
                  <RocketLaunchIcon size={16} aria-hidden /> Launch plan
                </Link>
              </div>
            }
          />
        </div>
      </div>

      {starterFailed ? (
        <Notice tone="warning">The project was created, but the starter&apos;s files couldn&apos;t be added. Import files from the Files page, or create the project again.</Notice>
      ) : null}

      {rescueFailed ? (
        <Notice tone="warning">The project was created, but the zip&apos;s files couldn&apos;t be stored, so there&apos;s nothing to check yet. Import a smaller folder from the Files page, for example src.</Notice>
      ) : null}

      {query.import === "failed" ? (
        <Notice tone="warning">The project was created, but the repository&apos;s files couldn&apos;t be stored. Import a smaller folder from the Files page, for example src.</Notice>
      ) : query.import === "github" ? (
        <Notice>
          {files.length.toLocaleString("en-US")} {files.length === 1 ? "file" : "files"} imported from GitHub. Describe a change below, or{" "}
          <Link href={`/app/projects/${project.id}/security`} className="font-medium text-accent hover:underline">
            check it for security
          </Link>{" "}
          first.
        </Notice>
      ) : null}

      {project.archivedAt ? (
        <Notice tone="warning">
          Archived <LocalTime iso={project.archivedAt} />. This project is read-only: its files, tasks and evidence stay readable, and it doesn&apos;t count toward your plan&apos;s
          project limit.
        </Notice>
      ) : null}

      {canChange ? (
        <section aria-label="Describe a change" className="aurora">
          <PromptComposer mode="app" size="compact" projectId={project.id} />
        </section>
      ) : null}

      {contents ? (
        <section aria-labelledby="preview-heading" className="grid gap-3 rounded-md border border-line bg-surface p-4 shadow-e1 sm:p-5">
          <h2 id="preview-heading" className="flex items-center gap-2 text-lg font-medium">
            <EyeIcon size={20} weight="bold" className="text-accent" aria-hidden /> Live preview
          </h2>
          <StaticPreview versions={[{ id: "now", label: "Current", files: Object.fromEntries(contents.map((f) => [f.path, f.content])) }]} />
        </section>
      ) : null}

      {publish ? <PublishPanel projectId={project.id} data={publish} disabledReason={publishReason ?? withheldFor(ctx.role, ctx.permissions, "publish")} /> : null}

      <ProjectSkills projectId={project.id} skills={skills} disabledReason={publishReason} />

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
              <Link href={`/app/projects/${project.id}/files`} className="inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline">
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
                <a href={`/app/projects/${project.id}/export`} download className={buttonClasses("secondary", "sm")}>
                  <ArchiveIcon size={16} aria-hidden /> Export everything
                </a>
              </div>
              <p className="mt-3 text-xs text-ink-3">
                Export everything adds the tasks, contracts, ProofPacks and history, ready to build without Farbaek. Anyone can check its evidence at{" "}
                <Link href="/verify" className="underline underline-offset-2 hover:text-ink">
                  farbaek.com/verify
                </Link>
                .
              </p>
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
          <div className="flex items-start justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <ShieldCheckIcon size={20} className="text-ink-3" aria-hidden /> Security
            </h2>
            <Link href={`/app/projects/${project.id}/security`} className="inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline">
              Open <ArrowRightIcon size={14} aria-hidden />
            </Link>
          </div>
          <p className="mt-2 text-sm text-ink-2">Check the code for leaked secrets, unsafe patterns, vulnerable packages and risky logic, then fix findings with the agent.</p>
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
