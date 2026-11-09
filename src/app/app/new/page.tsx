import { ArrowRightIcon, LayoutIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardTitle } from "@/components/app/primitives";
import { PromptComposer } from "@/components/build/prompt-composer";
import { SiteThumb } from "@/components/app/site-thumb";
import { promptFromShare } from "@/core/agent/prompt-start";
import { TEMPLATE_STARTERS, getStarter } from "@/content/starters";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import { loadAppContext } from "@/server/workspace/context";
import { DISPLAY_TITLE } from "@/components/ui/titles";

export const metadata: Metadata = { title: "New build" };

type Props = { searchParams: Promise<{ resume?: string; template?: string; title?: string; text?: string; url?: string }> };

export default async function NewBuildPage({ searchParams }: Props) {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const { resume, template: templateId, title, text, url } = await searchParams;
  // Shared to Farbaek from another app (ADR 0171): the build box shows it as a draft, and this says where it came from.
  const shared = promptFromShare({ title, text, url });
  const chosen = getStarter(templateId);
  const template = chosen?.kind === "template" ? chosen : null;
  const canBuild = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const reason =
    ctx.mode === "demo" ? "The demo workspace is read-only." : !ctx.writes.enabled ? ctx.writes.reason : !canBuild ? "Your role can view work but not start builds." : null;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-10 pt-2 sm:pt-8">
      <div className="grid gap-3">
        <h1 className={DISPLAY_TITLE}>What do you want to build?</h1>
        <p className="max-w-[56ch] text-body leading-relaxed text-ink-2">
          Describe it in your own words. Farbaek sets up the project, drafts a plan you can read in a minute, and starts the agent once you approve it.
        </p>
      </div>
      {shared ? <p className="-mt-4 text-body text-ink-2">This comes from what you shared. Nothing starts until you press Plan it.</p> : null}
      {template ? (
        <div className="grid items-center gap-4 rounded-md border border-line bg-surface p-3 shadow-e1 sm:grid-cols-[200px_minmax(0,1fr)]">
          <SiteThumb src={`/app/templates/${template.id}/thumbnail`} name={template.name} />
          <div className="grid gap-1 px-1">
            <p className="text-title-4 font-medium">{template.name} template</p>
            <p className="text-sm text-ink-2">{template.summary} Its content is sample text the agent replaces.</p>
            <Link href="/app/templates" className="mt-1 inline-flex min-h-11 w-fit items-center text-sm font-medium text-accent hover:underline">
              Choose another template
            </Link>
          </div>
        </div>
      ) : null}
      <div className="aurora">
        <PromptComposer
          mode="app"
          autoResume={resume === "1" && !template}
          disabledReason={reason}
          template={template ? { id: template.id, name: template.name, example: template.examplePrompt ?? template.summary } : undefined}
        />
      </div>
      <ul className="grid text-sm text-ink-3 sm:flex sm:flex-wrap sm:gap-x-6">
        {[
          { lead: "Want a head start?", href: "/app/templates", label: "Browse templates" },
          { lead: "Built it elsewhere?", href: "/app/rescue", label: "Check your app" },
          { lead: "Prefer to set things up yourself?", href: "/app/projects", label: "Create a project" },
        ].map((w) => (
          <li key={w.href} className="flex flex-wrap items-center gap-x-1.5">
            {w.lead}
            <Link href={w.href} className="inline-flex min-h-11 items-center gap-1 font-medium text-accent hover:underline">
              {w.label} <ArrowRightIcon size={14} weight="bold" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {!template ? (
        <section aria-labelledby="start-from" className="grid gap-4 border-t border-line pt-8">
          <div className="flex items-end justify-between gap-3">
            <CardTitle id="start-from" icon={LayoutIcon}>
              Or start from a template
            </CardTitle>
            <Link href="/app/templates" className="inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline">
              Preview them <ArrowRightIcon size={14} weight="bold" aria-hidden />
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {TEMPLATE_STARTERS.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/app/new?template=${t.id}`}
                  className="group block h-full rounded-md border border-line bg-surface p-2 shadow-e1 transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1 hover:border-accent/25 hover:shadow-e3"
                >
                  <SiteThumb src={`/app/templates/${t.id}/thumbnail`} name={t.name} className="ring-1 ring-line/80" />
                  <span className="block px-2 pb-1.5 pt-3 text-sm font-medium transition-colors duration-200 group-hover:text-accent">{t.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
