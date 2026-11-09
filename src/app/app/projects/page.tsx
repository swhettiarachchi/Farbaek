import { ArchiveIcon, ArrowRightIcon, FolderSimplePlusIcon, GithubLogoIcon, SquaresFourIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateProjectForm } from "@/components/app/forms";
import { GitHubImportForm, type PrivateImport } from "@/components/files/github-import";
import { ProjectCard } from "@/components/app/project-card";
import { Card, CardTitle, EmptyState, PageHeader } from "@/components/app/primitives";
import { buttonClasses } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { RelativeTime } from "@/components/ui/local-time";
import { checkQuota } from "@/core/billing/entitlements";
import { TERMINAL_STATES } from "@/core/realityloop/task-machine";
import { readGitHubConnection } from "@/server/github/store";
import { vaultKey } from "@/server/launch/token-vault";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext, type AppContext } from "@/server/workspace/context";
import { MANAGER_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Projects" };

/** Whether this person can import private repositories, and if not, why (ADR 0144). */
async function privateImportFor(ctx: AppContext): Promise<PrivateImport> {
  if (ctx.mode !== "live" || !ctx.current) return { ready: false, reason: "Private repositories need a signed-in workspace with GitHub connected." };
  if (!ctx.role || !MANAGER_ROLES.includes(ctx.role)) return { ready: false, reason: "Private repositories: an owner or admin can import them with the workspace's GitHub connection." };
  const user = await createSupabaseServerClient();
  const connection = user ? await readGitHubConnection(user, ctx.current.id).catch(() => null) : null;
  if (!connection) return { ready: false, reason: "To import private repositories, connect GitHub in Settings with a token that can read them." };
  if (!vaultKey()) return { ready: false, reason: "Private repositories can't be imported right now: this server can't open stored tokens." };
  return { ready: true, login: connection.login };
}

/** What the plan's limit means for someone, including someone with more than a smaller plan includes. */
function projectCountWords(count: number, limit: number | null): string {
  const lead = "A project is one site or app.";
  if (limit === null) return lead;
  if (count > limit) return `${lead} You have ${count}, and your plan includes ${limit}, so archive one before adding another.`;
  return `${lead} You're using ${count} of the ${limit} your plan includes.`;
}

/** A project's tasks in a sentence, with no count when there's nothing to count. */
function taskWords({ open, total }: { open: number; total: number }): string {
  if (total === 0) return "No tasks yet.";
  if (open === 0) return `${total} ${total === 1 ? "task" : "tasks"}, none open.`;
  return `${open} of ${total} ${total === 1 ? "task" : "tasks"} open.`;
}

export default async function ProjectsPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  const [projects, tasks, archived] = await Promise.all([ctx.reader.listProjects(ws.id), ctx.reader.listTasks(ws.id), ctx.reader.listArchivedProjects(ws.id).catch(() => [])]);

  const privateImport = await privateImportFor(ctx);

  const quota = checkQuota(ws.plan, "workspaces", { used: projects.length });
  const disabledReason = !ctx.writes.enabled ? ctx.writes.reason : !quota.allowed ? quota.message : null;
  const counts = new Map<string, { open: number; total: number }>();
  for (const t of tasks) {
    const c = counts.get(t.projectId) ?? { open: 0, total: 0 };
    c.total += 1;
    if (!TERMINAL_STATES.has(t.state)) c.open += 1;
    counts.set(t.projectId, c);
  }

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Projects"
        description={projectCountWords(projects.length, ws.plan.limits.workspaces)}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/app/templates" className={buttonClasses("secondary", "sm")}>
              Templates
            </Link>
            <Link href="/app/rescue" className={buttonClasses("secondary", "sm")}>
              Check an app built elsewhere
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        {projects.length === 0 ? (
          <EmptyState
            icon={SquaresFourIcon}
            title="No projects yet"
            action={
              <Link href="/app/new" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent hover:underline">
                Describe what you want to build <ArrowRightIcon size={16} weight="bold" aria-hidden />
              </Link>
            }
          >
            Describe a site or app and Farbaek makes the project and a plan for it. Or create an empty project here and bring in files from your computer or a GitHub repository.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {projects.map((p) => {
              const c = counts.get(p.id) ?? { open: 0, total: 0 };
              return (
                <li key={p.id}>
                  <ProjectCard
                    id={p.id}
                    name={p.name}
                    description={p.description}
                    meta={
                      <>
                        {taskWords(c)} Created <RelativeTime iso={p.createdAt} />.
                      </>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}

        <div className="grid gap-6">
          <Card>
            <CardTitle icon={FolderSimplePlusIcon}>New project</CardTitle>
            <p className="mt-1 text-sm text-ink-2">Name it after your product.</p>
            <div className="mt-5">
              <CreateProjectForm disabledReason={disabledReason} />
            </div>
          </Card>
          <Card>
            <CardTitle icon={GithubLogoIcon}>Import from GitHub</CardTitle>
            <p className="mt-1 text-sm text-ink-2">A new project with the repository&apos;s code, ready for a build or a security check.</p>
            <div className="mt-5">
              <GitHubImportForm disabledReason={ctx.mode === "demo" ? "The demo workspace is read-only." : disabledReason} privateImport={privateImport} />
            </div>
          </Card>
        </div>
      </div>

      {archived.length > 0 ? (
        // An archived project leaves the list but stays readable, so this is where it can be found again.
        <Disclosure summary="Archived projects" icon={<ArchiveIcon size={20} />} hint="Read-only, and not counted toward your plan. Open one to see its files, tasks and proof.">
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
            {archived.map((p) => (
              <li key={p.id}>
                <Link href={`/app/projects/${p.id}`} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-canvas-2 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium">{p.name}</span>
                    <span className="block text-xs text-ink-3">
                      Archived {p.archivedAt ? <RelativeTime iso={p.archivedAt} /> : null}
                    </span>
                  </span>
                  <ArrowRightIcon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </div>
  );
}
