import { FolderSimpleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateProjectForm } from "@/components/app/forms";
import { GitHubImportForm, type PrivateImport } from "@/components/files/github-import";
import { ProjectCard } from "@/components/app/project-card";
import { Card, EmptyState, PageHeader } from "@/components/app/primitives";
import { buttonClasses } from "@/components/ui/button";
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

export default async function ProjectsPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  const [projects, tasks] = await Promise.all([ctx.reader.listProjects(ws.id), ctx.reader.listTasks(ws.id)]);

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
        description={`A project is one codebase or product. ${projects.length} of ${ws.plan.limits.workspaces ?? "contract"} allowed on your plan.`}
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
          <EmptyState icon={FolderSimpleIcon} title="No projects yet">
            Create a project for the codebase or product you want Farbaek to work on, then import its files from a folder on your computer, or import a GitHub repository.
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
                        {c.open} open of {c.total} {c.total === 1 ? "task" : "tasks"} · created <RelativeTime iso={p.createdAt} />
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
            <h2 className="text-lg font-medium">New project</h2>
            <p className="mt-1 text-sm text-ink-2">Name it after the product or repository.</p>
            <div className="mt-5">
              <CreateProjectForm disabledReason={disabledReason} />
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-medium">Import from GitHub</h2>
            <p className="mt-1 text-sm text-ink-2">A new project with the repository&apos;s code, ready for a build or a security check.</p>
            <div className="mt-5">
              <GitHubImportForm disabledReason={ctx.mode === "demo" ? "The demo workspace is read-only." : disabledReason} privateImport={privateImport} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
