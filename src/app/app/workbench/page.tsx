import "@/styles/chat-theme.css";
import { ArrowRightIcon, FolderSimpleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand/brand-logo";
import { PromptComposer } from "@/components/build/prompt-composer";
import { WorkbenchStage } from "@/components/workbench/stage";
import { PART_TITLE } from "@/components/ui/titles";
import { buildTargets } from "@/core/workspace/build-target";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export const metadata: Metadata = { title: "Build" };
export const dynamic = "force-dynamic";

/**
 * Where Build starts (stage 202, ADR 0219): the build box, and the projects to open in Build's workspace. A request written
 * here comes back to the workspace for its project, with the plan waiting in the Agent pane.
 */
export default async function WorkbenchIndexPage() {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in?next=/app/workbench");
  if (!ctx.current) redirect("/app");
  const all = await ctx.reader.listProjects(ctx.current.id).catch(() => []);
  const projects = all.filter((p) => !p.archivedAt);
  const canBuild = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const reason = ctx.mode === "demo" ? "The sample workspace can't start a build. Sign in to build for real." : !ctx.writes.enabled ? ctx.writes.reason : !canBuild ? "Your role can view work but not start builds." : null;

  return (
    <WorkbenchStage heading="Build" name="Build" skip={{ href: "#workbench-start", label: "Skip to the build box" }} projects={false}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-8 sm:py-14">
          <div className="grid justify-items-center gap-3 text-center motion-safe:animate-[chat-rise_320ms_cubic-bezier(0.16,1,0.3,1)_both]">
            <BrandLogo height={80} preload />
            <h2 className={PART_TITLE}>What shall we build?</h2>
            <p className="max-w-lg text-body leading-relaxed text-ink-2">Describe a site or an app, or a change to one you have. The agent drafts a plan, you approve it, and you watch it work beside the preview and the code.</p>
          </div>

          <div id="workbench-start">
            <PromptComposer mode="app" surface="workbench" disabledReason={reason} targets={buildTargets(all, ctx.current.plan.limits.workspaces)} />
          </div>

          {projects.length > 0 ? (
            <section aria-labelledby="workbench-projects" className="grid gap-3">
              <h2 id="workbench-projects" className="px-1 text-sm font-medium text-ink-3">
                Open a project
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {projects.map((p, i) => (
                  <li key={p.id} className="motion-safe:animate-[chat-rise_260ms_cubic-bezier(0.16,1,0.3,1)_both]" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <Link
                      href={`/app/workbench/${p.id}`}
                      className="group flex h-full min-h-16 items-center gap-3 rounded-md border border-line bg-surface p-3.5 shadow-e1 transition-[border-color,box-shadow,transform] duration-200 ease-standard hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--color-spark-leaf)_42%,var(--color-line))] hover:shadow-[0_14px_30px_-18px_color-mix(in_oklab,var(--color-spark-leaf)_60%,transparent)] active:scale-[0.99]"
                    >
                      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full text-spark-leaf" style={{ background: "color-mix(in oklab, var(--color-spark-leaf) 11%, var(--color-surface))" }}>
                        <FolderSimpleIcon size={16} weight="fill" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                        {p.description ? <span className="block truncate text-xs text-ink-3">{p.description}</span> : null}
                      </span>
                      <ArrowRightIcon size={16} weight="bold" className="shrink-0 text-ink-3 transition-transform duration-200 ease-standard group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </WorkbenchStage>
  );
}
