import {
  ArchiveIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenTextIcon,
  BrowserIcon,
  CloudArrowUpIcon,
  DownloadSimpleIcon,
  FolderOpenIcon,
  GithubLogoIcon,
  GraphIcon,
  ListBulletsIcon,
  PaletteIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateTaskForm } from "@/components/app/forms";
import { PromptComposer } from "@/components/build/prompt-composer";
import { StaticPreview } from "@/components/preview/static-preview";
import { PublishPanel } from "@/components/publish/publish-panel";
import { placeholderCount } from "@/core/media/library";
import { UPGRADE_DESIGN, usesStudioKit } from "@/core/media/studio-kit";
import { ProjectSkills, type ProjectSkillView } from "@/components/skills/project-skills";
import { ReportResult } from "@/components/tasks/report-result";
import { Disclosure } from "@/components/ui/disclosure";
import { skillPinStatus } from "@/core/agent/skill-pins";
import { isProjectSkillPath, parseSkill } from "@/core/agent/skills";
import { loadPublishPanel } from "@/server/publish/panel";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import { runProfile } from "@/content/starters";
import { needsPackageJson } from "@/core/workspace/static-site";
import { PreviewButton } from "@/components/app/preview-button";
import { previewUnavailableReason, readSandboxConfig } from "@/server/sandbox/config";
import { ArchiveProject } from "@/components/app/archive-project";
import { LocalTime } from "@/components/ui/local-time";
import { MANAGER_ROLES } from "@/server/workspace/types";
import { Card, CardTitle, EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { TaskList } from "@/components/app/task-list";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { formatBytes } from "@/core/workspace/files";
import { copyVersion } from "@/core/workspace/device-copy";
import { KeepOnDevice } from "@/components/device/keep-on-device";
import { previewImages } from "@/server/workspace/preview-images";
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
  // Text and images are counted apart: a few photos shouldn't turn the instant preview off (ADR 0108).
  const filesBytes = files.filter((f) => f.encoding !== "base64").reduce((n, f) => n + f.sizeBytes, 0);
  const imageBytes = files.filter((f) => f.encoding === "base64").reduce((n, f) => n + f.sizeBytes, 0);
  // Which revision of each file the project is at, so a copy kept on this device can tell it's out of date (ADR 0192).
  const deviceVersion = await copyVersion(files);
  const previewReason = ctx.mode === "demo" ? "Previews need a real workspace." : previewUnavailableReason(readSandboxConfig());
  // Static sites preview instantly in a locked-down frame; apps with a server use the sandbox preview.
  const paths = files.map((f) => f.path);
  // A bare package.json beside index.html keeps a site static; its text decides that.
  const packageJson = needsPackageJson(paths) ? ((await ctx.reader.getFile(ctx.current.id, project.id, "package.json").catch(() => null))?.content ?? null) : null;
  const isStatic = runProfile(paths, packageJson).kind === "static" && filesBytes <= 3 * 1024 * 1024;
  const contents = isStatic ? await ctx.reader.getProjectContents(ctx.current.id, project.id).catch(() => null) : null;
  // Images, videos and scenes the build left as stand-ins for the person's own (ADR 0156).
  const placeholders = contents ? placeholderCount(contents) : 0;
  // A site built before the Studio kit can be brought up to it in one approved plan (ADR 0157).
  const preKit = Boolean(contents?.some((f) => f.path === "index.html")) && !usesStudioKit(contents ?? []);
  // The site's own images, inlined as data URLs while they fit the preview budget; past that the preview shows them as missing.
  const images = isStatic && imageBytes > 0 ? await previewImages(ctx.reader, ctx.current.id, project.id) : undefined;
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
          <ArrowLeftIcon size={14} weight="bold" aria-hidden /> Projects
        </Link>
        <div className="mt-3">
          <PageHeader
            title={project.name}
            description={project.description ?? undefined}
            actions={
              <div className="flex flex-wrap gap-2">
                {/* Two at most here, so a phone shows the page's job first; the project map and GitHub sit lower down. */}
                <Link href={`/app/projects/${project.id}/launch`} className={buttonClasses("secondary", "sm")}>
                  <CloudArrowUpIcon size={16} weight="bold" aria-hidden /> Launch plan
                </Link>
                {/* Apps with a build step get the component editor (ADR 0129); static sites open it from the live preview below. */}
                {!isStatic && files.some((f) => /.(tsx|jsx)$/.test(f.path)) ? (
                  <Link href={`/app/projects/${project.id}/design`} className={buttonClasses("secondary", "sm")}>
                    <PaletteIcon size={16} weight="bold" aria-hidden /> Visual editor
                  </Link>
                ) : null}
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
          {query.linked === "1" ? (
            <>
              {" "}
              It&apos;s linked to its repository, so applied changes open{" "}
              <Link href={`/app/projects/${project.id}/github`} className="font-medium text-accent hover:underline">
                pull requests there
              </Link>
              .
            </>
          ) : query.linked === "failed" ? (
            <>
              {" "}
              It couldn&apos;t be linked to its repository just now. An owner or admin can link it on the{" "}
              <Link href={`/app/projects/${project.id}/github`} className="font-medium text-accent hover:underline">
                project&apos;s GitHub page
              </Link>
              .
            </>
          ) : null}
        </Notice>
      ) : null}

      {project.archivedAt ? (
        <Notice tone="warning">
          Archived <LocalTime iso={project.archivedAt} />. This project is read-only: its files, tasks and proof stay readable, and it doesn&apos;t count toward your plan&apos;s
          project limit.
        </Notice>
      ) : null}

      {canChange ? (
        <section aria-label="Describe a change" className="aurora">
          <PromptComposer mode="app" size="compact" projectId={project.id} suggestion={preKit ? UPGRADE_DESIGN : undefined} />
        </section>
      ) : null}

      {contents ? (
        <section aria-labelledby="preview-heading" className="grid gap-3 rounded-md border border-line bg-surface p-4 shadow-e1 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle id="preview-heading" icon={BrowserIcon}>
              Live preview
            </CardTitle>
            <ButtonLink href={`/app/projects/${project.id}/design`} variant="secondary" size="sm">
              <PaletteIcon size={16} weight="bold" aria-hidden /> Visual editor
            </ButtonLink>
          </div>
          <StaticPreview versions={[{ id: "now", label: "Current", files: Object.fromEntries(contents.map((f) => [f.path, f.content])), images }]} />
          <ReportResult about={{ projectId: project.id }} />
        </section>
      ) : null}

      {publish && placeholders > 0 ? (
        <Notice>
          This site still shows {placeholders} stand-in {placeholders === 1 ? "image or video" : "images or videos"}. Put your own in with Replace in the{" "}
          <Link href={`/app/projects/${project.id}/design`} className="font-medium text-accent hover:underline">
            visual editor
          </Link>
          , or publish it as it is.
        </Notice>
      ) : null}
      {publish ? <PublishPanel projectId={project.id} data={publish} disabledReason={publishReason ?? withheldFor(ctx.role, ctx.permissions, "publish")} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <section aria-labelledby="tasks-heading" className="grid gap-4">
          <CardTitle id="tasks-heading" icon={ListBulletsIcon}>
            Tasks
          </CardTitle>
          {tasks.length === 0 ? (
            <EmptyState icon={ListBulletsIcon} title="No tasks in this project">
              Describe one thing you want. You read and approve a plan before anything changes.
            </EmptyState>
          ) : (
            <TaskList tasks={tasks} showProject={false} />
          )}
        </section>

        <div className="grid gap-6">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <CardTitle icon={FolderOpenIcon}>Files</CardTitle>
            {files.length > 0 ? (
              <Link href={`/app/projects/${project.id}/files`} className="inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline">
                Open <ArrowRightIcon size={14} weight="bold" aria-hidden />
              </Link>
            ) : null}
          </div>
          {files.length > 0 ? (
            <>
              <p className="mt-2 text-sm text-ink-2">
                <span className="tabular">{files.length.toLocaleString("en-US")}</span> {files.length === 1 ? "file" : "files"}, <span className="tabular">{formatBytes(filesBytes + imageBytes)}</span>.
              </p>
              <div className="mt-4 flex flex-wrap items-start gap-3">
                <PreviewButton projectId={project.id} disabledReason={previewReason} variant="primary" />
                <a href={`/app/projects/${project.id}/download`} download className={buttonClasses("secondary", "sm")}>
                  <DownloadSimpleIcon size={16} weight="bold" aria-hidden /> Download .zip
                </a>
                <a href={`/app/projects/${project.id}/export`} download className={buttonClasses("secondary", "sm")}>
                  <DownloadSimpleIcon size={16} weight="bold" aria-hidden /> Export everything
                </a>
              </div>
              <p className="mt-3 text-xs text-ink-3">
                Export everything adds the tasks, plans, ProofPacks and history, ready to build without Farbaek. Anyone can check its proof at{" "}
                <Link href="/verify" className="underline underline-offset-2 hover:text-ink">
                  farbaek.com/verify
                </Link>
                .
              </p>
              {!previewReason && !files.some((f) => f.path === "index.html") ? (
                <p className="mt-3 text-xs text-ink-3">
                  Previews serve the files as they are, starting from the site&apos;s main page, and this project doesn&apos;t have one yet. Apps that need building preview from a test space.
                </p>
              ) : null}
              <KeepOnDevice projectId={project.id} userId={ctx.user.id} version={deviceVersion} />
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
            <CardTitle icon={ShieldCheckIcon}>Security</CardTitle>
            <Link href={`/app/projects/${project.id}/security`} className="inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline">
              Open <ArrowRightIcon size={14} weight="bold" aria-hidden />
            </Link>
          </div>
          <p className="mt-2 text-sm text-ink-2">Check the code for leaked secrets, unsafe patterns, vulnerable packages and risky logic, then fix findings with the agent.</p>
        </Card>
        <nav aria-labelledby="more-heading" className="grid gap-1">
          <p id="more-heading" className="text-xs font-medium text-ink-3">
            More for this project
          </p>
          <div className="flex flex-wrap gap-x-6">
            <Link href={`/app/projects/${project.id}/graph`} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink-2 hover:text-ink">
              <GraphIcon size={16} weight="bold" aria-hidden /> Project map
            </Link>
            <Link href={`/app/projects/${project.id}/github`} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink-2 hover:text-ink">
              <GithubLogoIcon size={16} weight="bold" aria-hidden /> GitHub
            </Link>
          </div>
        </nav>
        {/* Describing a change above drafts the plan; this is for work someone will plan later, so it stays folded. */}
        <Disclosure summary="Add a task without a plan" icon={<PlusIcon size={20} />} hint="For work you'll plan later. Describing a change above drafts the plan for you.">
          <Card>
            <CreateTaskForm
              projectId={project.id}
              disabledReason={!ctx.writes.enabled ? ctx.writes.reason : project.archivedAt ? "This project is archived, so new tasks can't be added." : null}
            />
          </Card>
        </Disclosure>
        {!project.archivedAt ? (
          <Card>
            <CardTitle icon={ArchiveIcon}>Archive</CardTitle>
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

      {/* One shape whatever the skills' state, so adding one doesn't reset the section and lose its message. */}
      <Disclosure summary="Skills" icon={<BookOpenTextIcon size={20} />} hint="Teach the agent how you like this project built" open={skills.some((s) => s.status !== "approved")}>
        <ProjectSkills projectId={project.id} skills={skills} disabledReason={publishReason} />
      </Disclosure>
    </div>
  );
}
