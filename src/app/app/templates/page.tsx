import { ArrowRightIcon, BrowserIcon, LayoutIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardTitle, PageHeader } from "@/components/app/primitives";
import { SiteThumb } from "@/components/app/site-thumb";
import { buttonClasses } from "@/components/ui/button";
import { TEMPLATE_STARTERS } from "@/content/starters";
import { loadAppContext } from "@/server/workspace/context";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Templates"
        description="Sites built to the Farbaek Studio standard, each with its own design, motion and a feature that works. When the agent puts your content in, it follows the template's design brief."
        actions={
          <Link href="/app/new" className={buttonClasses("secondary", "sm")}>
            Start from a sentence instead
          </Link>
        }
      />
      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {TEMPLATE_STARTERS.map((t, i) => (
          <li key={t.id} className="motion-safe:animate-[usage-in_260ms_cubic-bezier(0.16,1,0.3,1)_both]" style={{ animationDelay: `${i * 50}ms` }}>
            <article className="group grid h-full content-start gap-4 rounded-md border border-line bg-surface p-3 shadow-e1 transition-shadow duration-200 hover:shadow-e2">
              <Link href={`/app/templates/${t.id}`} className="block rounded-sm" aria-label={`Preview the ${t.name} template`}>
                <SiteThumb src={`/app/templates/${t.id}/thumbnail`} name={t.name} />
              </Link>
              <div className="grid gap-1 px-1.5">
                <CardTitle icon={LayoutIcon}>{t.name}</CardTitle>
                <p className="text-sm leading-relaxed text-ink-2">{t.summary}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 px-1.5 pb-1.5">
                <Link href={`/app/new?template=${t.id}`} className={buttonClasses("primary", "sm")}>
                  Use this template <ArrowRightIcon size={16} weight="bold" aria-hidden />
                </Link>
                <Link href={`/app/templates/${t.id}`} className={buttonClasses("secondary", "sm")}>
                  <BrowserIcon size={16} weight="bold" aria-hidden /> Preview
                </Link>
              </div>
            </article>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-3">All names, prices and quotes in the templates are sample content.</p>
    </div>
  );
}
