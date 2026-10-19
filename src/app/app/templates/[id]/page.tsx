import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/primitives";
import { StaticPreview } from "@/components/preview/static-preview";
import { buttonClasses } from "@/components/ui/button";
import { getStarter } from "@/content/starters";
import { loadAppContext } from "@/server/workspace/context";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const t = getStarter((await params).id);
  return { title: t?.kind === "template" ? `${t.name} template` : "Template" };
}

export default async function TemplatePage({ params }: Params) {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const t = getStarter((await params).id);
  if (!t || t.kind !== "template") notFound();
  const files = Object.fromEntries(t.files.map((f) => [f.path, f.content]));

  return (
    <div className="grid gap-6">
      <Link href="/app/templates" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-ink-2 hover:text-ink">
        <ArrowLeftIcon size={16} aria-hidden /> Templates
      </Link>
      <PageHeader
        title={`${t.name} template`}
        description={`${t.summary} Everything in it is sample content.`}
        actions={
          <Link href={`/app/new?template=${t.id}`} className={buttonClasses("primary", "sm")}>
            Use this template <ArrowRightIcon size={15} weight="bold" aria-hidden />
          </Link>
        }
      />
      <section aria-label="Preview" className="rounded-md border border-line bg-surface p-4 shadow-e1 sm:p-5">
        <StaticPreview versions={[{ id: "template", label: "Sample content", files }]} />
      </section>
      <p className="text-sm text-ink-2">
        Files: <span className="font-mono text-[13px]">{t.files.map((f) => f.path).join(", ")}</span>
      </p>
    </div>
  );
}
