import { ArrowLeftIcon, PaintBrushIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Notice, PageHeader } from "@/components/app/primitives";
import { ComponentEditor } from "@/components/studio/component-editor";
import { VisualEditor } from "@/components/studio/visual-editor";
import { componentFiles, isTailwindProject } from "@/core/studio/jsx-edit";
import { ButtonLink } from "@/components/ui/button";
import { runProfile } from "@/content/starters";
import { needsPackageJson } from "@/core/workspace/static-site";
import { sitePages } from "@/core/workspace/static-preview";
import { sandboxForPage } from "@/server/sandbox/page-context";
import { previewUnavailableReason, readSandboxConfig } from "@/server/sandbox/config";
import { loadAppContext, type AppContext } from "@/server/workspace/context";
import { previewImages } from "@/server/workspace/preview-images";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Visual editor" };

/** The project's running sandbox sessions to pick elements in (ADR 0149), or why picking isn't offered. */
async function pickSessions(ctx: AppContext, projectId: string): Promise<{ sessions: { id: string; name: string }[]; unavailable: string | null }> {
  const sandbox = await sandboxForPage(ctx);
  if (!sandbox.ok) return { sessions: [], unavailable: `Picking in the running app needs a sandbox. ${sandbox.reason}` };
  const unavailable = previewUnavailableReason(readSandboxConfig());
  if (unavailable) return { sessions: [], unavailable: `Picking in the running app needs previews. ${unavailable}` };
  const list = await sandbox.value.store.listSessions(sandbox.value.actor.orgId, { states: ["ready"], sort: "newest", page: 1, pageSize: 50 }).catch(() => null);
  if (!list) return { sessions: [], unavailable: "The project's sandbox sessions couldn't be read just now. Reload to try again." };
  return { sessions: list.rows.filter((s) => s.projectId === projectId).map((s) => ({ id: s.id, name: s.name })), unavailable: null };
}

/** The same budget as the project page's instant preview. */
const MAX_TEXT_BYTES = 3 * 1024 * 1024;

/**
 * The visual editor for a static site (ADR 0118): pick an element in the
 * page, change it, review the exact change to the HTML and CSS, and save it
 * as new revisions. Sites with a build step are edited in code or by the agent.
 */
export default async function DesignPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  const query = await searchParams;
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const project = await ctx.reader.getProject(ctx.current.id, projectId);
  if (!project) notFound();
  const files = await ctx.reader.listFiles(ctx.current.id, project.id);
  const textBytes = files.filter((f) => f.encoding !== "base64").reduce((n, f) => n + f.sizeBytes, 0);
  const paths = files.map((f) => f.path);
  const packageJson = needsPackageJson(paths) ? ((await ctx.reader.getFile(ctx.current.id, project.id, "package.json").catch(() => null))?.content ?? null) : null;
  const isStatic = runProfile(paths, packageJson).kind === "static";
  const contents = isStatic && textBytes <= MAX_TEXT_BYTES ? await ctx.reader.getProjectContents(ctx.current.id, project.id).catch(() => null) : null;
  const text = contents ? Object.fromEntries(contents.map((f) => [f.path, f.content])) : null;
  const pages = text ? sitePages(text) : [];
  const images = pages.length > 0 && files.some((f) => f.encoding === "base64") ? await previewImages(ctx.reader, ctx.current.id, project.id) : undefined;
  // Apps with a build step (ADR 0129): their components, plus the files that say whether Tailwind is in use.
  const components = isStatic ? [] : componentFiles(files.filter((f) => f.encoding !== "base64").map((f) => f.path));
  const componentBytes = files.filter((f) => components.includes(f.path)).reduce((n, f) => n + f.sizeBytes, 0);
  const componentText =
    components.length && componentBytes <= MAX_TEXT_BYTES
      ? await ctx.reader
          .getProjectContents(ctx.current.id, project.id)
          .catch(() => null)
      : null;
  const componentContents = componentText ? Object.fromEntries(componentText.filter((f) => components.includes(f.path)).map((f) => [f.path, f.content])) : null;
  const tailwind = componentText ? isTailwindProject(Object.fromEntries(componentText.filter((f) => f.path === "package.json" || /.css$|tailwind.config./.test(f.path)).map((f) => [f.path, f.content]))) : false;
  const saved = Number(typeof query.saved === "string" ? query.saved : 0);
  const initialPage = typeof query.page === "string" ? query.page : null;

  const saveReason =
    ctx.mode === "demo"
      ? "The demo workspace is read-only, so changes here can't be saved. Everything else works."
      : !ctx.writes.enabled
        ? ctx.writes.reason
        : project.archivedAt
          ? "This project is archived, so its files are read-only."
          : ctx.role === null || !CONTRIBUTOR_ROLES.includes(ctx.role)
            ? "Viewers can't change files. Ask an owner or admin for a member role."
            : null;

  // Picking in the running app (ADR 0149): the project's running sandbox sessions, or why it isn't offered.
  const pick = isStatic || components.length === 0 ? null : await pickSessions(ctx, project.id);

  const unavailable = !isStatic
    ? components.length === 0
      ? "This project has a build step but no React components (.tsx or .jsx) to edit. Change it in code or describe the change to the agent."
      : componentBytes > MAX_TEXT_BYTES
        ? "This app's components are over 3 MB, more than the component editor loads at once. Change it in code or describe the change to the agent."
        : null
    : textBytes > MAX_TEXT_BYTES
      ? "This site's text files are over 3 MB, more than the visual editor loads at once. Change it in code or describe the change to the agent."
      : pages.length === 0
        ? "This project has no HTML pages yet. Add an index.html, or describe the site to the agent."
        : null;

  return (
    <div className="grid gap-6">
      <div>
        <Link href={`/app/projects/${project.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={16} aria-hidden /> {project.name}
        </Link>
        {isStatic ? (
          <PageHeader
            title="Visual editor"
            description="Pick an element in the page and change its words, link or style. Each change is an edit to the site's own HTML and CSS, which you review as a diff before it's saved."
          />
        ) : (
          <PageHeader
            title="Component editor"
            description="Choose a component and an element in it, then change its words or Tailwind classes. Each change is an edit to the component's own JSX, which you review as a diff before it's saved."
          />
        )}
      </div>

      {saved > 0 ? (
        <Notice>
          Saved {saved === 1 ? "1 file" : `${saved} files`} as new revisions. Each file&apos;s history on the Files page shows the change and can restore the version before it.
        </Notice>
      ) : null}

      {!isStatic && !unavailable && componentContents ? (
        <ComponentEditor
          key={files.map((f) => `${f.path}@${f.revision}`).join("|")}
          projectId={project.id}
          files={componentContents}
          revisions={Object.fromEntries(files.map((f) => [f.path, f.revision]))}
          tailwind={tailwind}
          disabledReason={saveReason}
          pick={pick}
        />
      ) : unavailable || !text ? (
        <EmptyState
          icon={PaintBrushIcon}
          title="Not available for this project"
          action={
            <ButtonLink href={`/app/projects/${project.id}/files`} variant="secondary" size="sm">
              Open the files
            </ButtonLink>
          }
        >
          {unavailable ?? "The project's files couldn't be read just now. Reload the page to try again."}
        </EmptyState>
      ) : (
        <VisualEditor
          key={files.map((f) => `${f.path}@${f.revision}`).join("|")}
          projectId={project.id}
          files={text}
          revisions={Object.fromEntries(files.map((f) => [f.path, f.revision]))}
          images={images}
          initialPage={initialPage}
          disabledReason={saveReason}
        />
      )}
    </div>
  );
}
