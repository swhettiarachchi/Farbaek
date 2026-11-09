import { ArrowLeftIcon, ArrowUpRightIcon, GitBranchIcon, GitPullRequestIcon, GithubLogoIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle, Notice, PageHeader } from "@/components/app/primitives";
import { PullStatusChip } from "@/components/github/pull-status";
import { PullOnGitHub } from "@/components/github/pull-on-github";
import { RepoLinkForm } from "@/components/github/repo-link";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { importedRepo } from "@/core/github/pull-request";
import { listProjectPulls, readGitHubConnection, readRepoLink, type GitHubConnectionView, type PullRequestView, type RepoLinkView } from "@/server/github/store";
import { vaultKey } from "@/server/launch/token-vault";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { MANAGER_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "GitHub" };

/**
 * A project's repository on GitHub (ADR 0126): which one it's linked to, and
 * the pull requests Farbaek opened there with the status each one carries.
 */
export default async function ProjectGitHubPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const project = await ctx.reader.getProject(ctx.current.id, projectId);
  if (!project) notFound();
  const orgId = ctx.current.id;
  const user = ctx.mode === "live" ? await createSupabaseServerClient() : null;
  let connection: GitHubConnectionView | null = null;
  let link: RepoLinkView | null = null;
  let pulls: PullRequestView[] = [];
  let unreadable = false;
  if (user) {
    [connection, link, pulls] = await Promise.all([
      readGitHubConnection(user, orgId).catch(() => ((unreadable = true), null)),
      readRepoLink(user, orgId, project.id).catch(() => ((unreadable = true), null)),
      listProjectPulls(user, orgId, project.id).catch(() => ((unreadable = true), [])),
    ]);
  }
  const canManage = ctx.role !== null && MANAGER_ROLES.includes(ctx.role);
  const linkReason =
    (ctx.mode === "demo" ? "The demo workspace is read-only." : ctx.writes.enabled ? null : ctx.writes.reason) ??
    (project.archivedAt ? "This project is archived." : null) ??
    (connection ? null : "Connect GitHub in Settings first.") ??
    (vaultKey() ? null : "This server can't open stored tokens right now.");
  const suggestion = importedRepo(project.description);
  const linked = link ? `${link.owner}/${link.repo}` : null;

  return (
    <div className="grid gap-8">
      <div>
        <Link href={`/app/projects/${project.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} weight="bold" aria-hidden /> {project.name}
        </Link>
        <div className="mt-2">
          <PageHeader title="GitHub" description="The repository this project's changes go to as pull requests, each with a Farbaek ProofPack status that says whether its checks passed." />
        </div>
      </div>

      {ctx.mode === "demo" ? (
        <Notice>The demo workspace isn&apos;t connected to GitHub. In your own workspace, connect a fine-grained token in Settings, then link a repository here.</Notice>
      ) : null}
      {unreadable ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> Part of this page couldn&apos;t be read. Reload to try again.
        </p>
      ) : null}

      <section aria-labelledby="repo-title" className="rounded-lg border border-line bg-surface p-6 shadow-e2 sm:p-8">
        <CardTitle id="repo-title" icon={GithubLogoIcon}>
          Linked repository
        </CardTitle>
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-3">
            {link ? (
              <>
                <p className="flex min-w-0 items-center gap-2 text-base">
                  <GithubLogoIcon size={20} className="shrink-0" aria-hidden />
                  <a href={`https://github.com/${link.owner}/${link.repo}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-0 items-center gap-1 break-all font-mono text-accent hover:underline">
                    {linked}
                    <ArrowUpRightIcon size={14} weight="bold" className="shrink-0" aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </p>
                <p className="flex items-center gap-2 text-sm text-ink-2">
                  <GitBranchIcon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
                  Pull requests go to <span className="font-mono">{link.defaultBranch}</span>. Linked <LocalTime iso={link.linkedAt} />.
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-2">Not linked. {suggestion ? `This project was imported from ${suggestion.owner}/${suggestion.repo}.` : null}</p>
            )}
            <p className="text-sm text-ink-3">
              {connection ? (
                <>
                  Uses the workspace&apos;s GitHub token, connected as <span className="font-mono">{connection.login}</span>.
                </>
              ) : (
                <>
                  GitHub isn&apos;t connected.{" "}
                  <Link href="/app/settings#github" className="font-medium text-accent hover:underline">
                    Connect it in Settings
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
          {canManage ? (
            <RepoLinkForm projectId={project.id} linked={linked} suggestion={suggestion ? `${suggestion.owner}/${suggestion.repo}` : null} disabledReason={linkReason} />
          ) : (
            <p className="text-sm text-ink-3">Owners and admins link a project to a repository.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="pulls-title" className="grid gap-4">
        <CardTitle id="pulls-title" icon={GitPullRequestIcon}>
          Pull requests from Farbaek
        </CardTitle>
        {pulls.length ? (
          <ul className="grid gap-3">
            {pulls.map((p, i) => (
              <li key={p.id} className="motion-safe:animate-[usage-in_260ms_cubic-bezier(0.16,1,0.3,1)_both]" style={{ animationDelay: `${i * 40}ms` }}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-1">
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-0 items-center gap-2 font-medium text-ink hover:text-accent">
                        <GitPullRequestIcon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
                        <span className="break-all">
                          {p.repo} #{p.number}
                        </span>
                        <ArrowUpRightIcon size={14} weight="bold" className="shrink-0" aria-hidden />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                      <p className="text-sm text-ink-2">
                        <span className="break-all font-mono">{p.branch}</span> into <span className="font-mono">{p.baseBranch}</span>, commit <span className="font-mono">{p.commitSha.slice(0, 7)}</span>. Opened <RelativeTime iso={p.openedAt} />.
                      </p>
                    </div>
                    <PullStatusChip state={p.status} />
                  </div>
                  <div className="mt-3">
                    <PullOnGitHub pull={p} />
                  </div>
                  <div className="mt-3">
                    <Link href={`/app/tasks/${p.taskId}`} className={buttonClasses("ghost", "sm")}>
                      Open the task
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <p className="text-sm text-ink-2">None yet. Once a change in this project is applied, its task has an Open a pull request button.</p>
          </Card>
        )}
      </section>
    </div>
  );
}
