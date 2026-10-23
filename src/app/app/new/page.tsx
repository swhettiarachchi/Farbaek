import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PromptComposer } from "@/components/build/prompt-composer";
import { SiteThumb } from "@/components/app/site-thumb";
import { TEMPLATE_STARTERS, getStarter } from "@/content/starters";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "New build" };

type Props = { searchParams: Promise<{ resume?: string; template?: string }> };

export default async function NewBuildPage({ searchParams }: Props) {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const { resume, template: templateId } = await searchParams;
  const chosen = getStarter(templateId);
  const template = chosen?.kind === "template" ? chosen : null;
  const canBuild = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const reason =
    ctx.mode === "demo" ? "The demo workspace is read-only." : !ctx.writes.enabled ? ctx.writes.reason : !canBuild ? "Your role can view work but not start builds." : null;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-10 pt-2 sm:pt-8">
      <div className="grid gap-3">
        <h1 className="text-balance text-[2.2rem] font-medium leading-[1.05] tracking-[-0.035em] sm:text-5xl">What do you want to build?</h1>
        <p className="max-w-[56ch] text-[15px] leading-relaxed text-ink-2">
          Describe it in your own words. Farbaek sets up the project, drafts a plan you can read in a minute, and starts the agent once you approve it.
        </p>
      </div>
      {template ? (
        <div className="grid items-center gap-4 rounded-md border border-line bg-surface p-3 shadow-e1 sm:grid-cols-[200px_minmax(0,1fr)]">
          <SiteThumb src={`/app/templates/${template.id}/thumbnail`} name={template.name} />
          <div className="grid gap-1 px-1">
            <p className="text-[13px] font-medium text-ink-3">Template</p>
            <p className="text-[17px] font-medium">{template.name}</p>
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
      <p className="text-sm text-ink-3">
        Want a head start?{" "}
        <Link href="/app/templates" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
          Browse templates <ArrowRightIcon size={13} weight="bold" aria-hidden />
        </Link>
        {" "}Built it elsewhere?{" "}
        <Link href="/app/rescue" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
          Check your app <ArrowRightIcon size={13} weight="bold" aria-hidden />
        </Link>
        {" "}Prefer to set things up yourself?{" "}
        <Link href="/app/projects" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
          Create a project <ArrowRightIcon size={13} weight="bold" aria-hidden />
        </Link>
      </p>
      {!template ? (
        <section aria-labelledby="start-from" className="grid gap-4 border-t border-line pt-8">
          <div className="flex items-end justify-between gap-3">
            <h2 id="start-from" className="text-lg font-medium tracking-[-0.01em]">
              Or start from a template
            </h2>
            <Link href="/app/templates" className="inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline">
              Preview them <ArrowRightIcon size={13} aria-hidden />
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {TEMPLATE_STARTERS.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/app/new?template=${t.id}`}
                  className="group block h-full rounded-md border border-line bg-surface p-2 shadow-e1 transition-[transform,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1 hover:border-accent/25 hover:shadow-e3"
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
