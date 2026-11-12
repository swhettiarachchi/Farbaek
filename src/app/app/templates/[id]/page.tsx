import { ArrowLeftIcon, ArrowRightIcon, FilesIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/primitives";
import { StaticPreview } from "@/components/preview/static-preview";
import { buttonClasses } from "@/components/ui/button";
import { galleryFiles, galleryStarter } from "@/content/starters";
import { loadAppContext } from "@/server/workspace/context";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const t = galleryStarter((await params).id);
  return { title: t ? `${t.name} template` : "Template" };
}

export default async function TemplatePage({ params }: Params) {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const t = galleryStarter((await params).id);
  if (!t) notFound();
  // An app that runs a server shows snapshots of its pages; it runs for real in a test space once it's a project (stage 180).
  const files = galleryFiles(t);

  return (
    <div className="grid gap-6">
      <Link href="/app/templates" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-ink-2 hover:text-ink">
        <ArrowLeftIcon size={16} weight="bold" aria-hidden /> Templates
      </Link>
      <PageHeader
        title={`${t.name} template`}
        description={`${t.summary} Everything in it is sample content.${t.gallery ? " This preview is a picture of its pages; start it in a test space to sign up and use it." : ""}`}
        actions={
          <Link href={`/app/new?template=${t.id}`} className={buttonClasses("primary", "sm")}>
            Use this template <ArrowRightIcon size={16} weight="bold" aria-hidden />
          </Link>
        }
      />
      <section aria-label="Preview" className="rounded-md border border-line bg-surface p-4 shadow-e1 sm:p-5">
        <StaticPreview versions={[{ id: "template", label: "Sample content", files }]} />
      </section>
      <p className="flex items-start gap-2 text-sm text-ink-2">
        <FilesIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
        <span>
          Files: <span className="font-mono text-label">{t.files.map((f) => f.path).join(", ")}</span>
        </span>
      </p>
    </div>
  );
}
