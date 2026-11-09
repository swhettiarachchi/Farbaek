import type { ReactNode } from "react";
import Link from "next/link";
import { CaretDownIcon } from "@phosphor-icons/react/ssr";
import { Container } from "@/components/ui/container";
import { LEGAL, LEGAL_DOCS } from "@/config/legal";
import { PUBLIC_TITLE } from "@/components/ui/titles";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/**
 * One layout for Farbaek's legal documents (ADR 0066): the short version
 * first, then numbered sections people can jump to. The sections are in
 * order, so the numbers mean something. The contents sit beside the text on
 * wide screens, and fold under the short version on narrow ones so the title
 * comes first.
 */
export function LegalDocument({
  title,
  path,
  summary,
  sections,
  updated = LEGAL.updated,
}: {
  title: string;
  path: string;
  summary: ReactNode;
  sections: LegalSection[];
  /** When this document last changed, if later than the shared date. */
  updated?: string;
}) {
  return (
    <section className="pt-14 pb-20 sm:pt-20 lg:pb-28">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-16">
          <article className="min-w-0 max-w-[72ch]">
            <h1 className={PUBLIC_TITLE}>{title}</h1>
            <p className="mt-4 text-sm text-ink-3">
              Last updated {updated}. Questions:{" "}
              <a href={`mailto:${LEGAL.contact}`} className="font-medium text-accent hover:underline">
                {LEGAL.contact}
              </a>
              .
            </p>
            <div className="mt-8 rounded-md border border-line bg-surface p-5 sm:p-6">
              <h2 className="text-body font-medium">The short version</h2>
              <div className="mt-3 text-body leading-relaxed text-ink-2">{summary}</div>
            </div>
            <div className="lg:hidden">
              <details className="group mt-4 rounded-md border border-line bg-surface">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-body font-medium [&::-webkit-details-marker]:hidden">
                  On this page
                  <CaretDownIcon size={16} weight="bold" className="shrink-0 text-ink-3 group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-200" aria-hidden />
                </summary>
                <div className="border-t border-line px-5 pb-4 pt-3">
                  <Contents title={title} path={path} sections={sections} />
                </div>
              </details>
            </div>
            <ol className="mt-12 grid gap-10">
              {sections.map((s, i) => (
                <li key={s.id} id={s.id} className="scroll-mt-24">
                  <h2 className="flex items-baseline gap-3 text-xl font-medium leading-snug tracking-[-0.02em]">
                    <span aria-hidden className="tabular text-body font-normal text-ink-3">
                      {i + 1}
                    </span>
                    {s.title}
                  </h2>
                  <div className="mt-3 grid gap-3 text-body leading-relaxed text-ink-2">{s.body}</div>
                </li>
              ))}
            </ol>
          </article>
          <div className="hidden lg:block">
            <aside className="sticky top-28">
              <p className="text-sm font-medium">On this page</p>
              <Contents title={title} path={path} sections={sections} />
            </aside>
          </div>
        </div>
      </Container>
    </section>
  );
}

/** The numbered sections, then the other two documents. */
function Contents({ title, path, sections }: { title: string; path: string; sections: LegalSection[] }) {
  return (
    <nav aria-label={`${title} sections`} className="grid gap-5">
      <ol className="mt-2 grid gap-0.5">
        {sections.map((s, i) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className="flex min-h-11 items-center gap-2 text-sm text-ink-2 hover:text-ink lg:min-h-9">
              <span className="tabular w-5 text-ink-3">{i + 1}</span>
              {s.title}
            </a>
          </li>
        ))}
      </ol>
      <div className="border-t border-line pt-4">
        <p className="text-sm font-medium">Also</p>
        <ul className="mt-1 grid gap-0.5">
          {LEGAL_DOCS.filter((o) => o.href !== path).map((o) => (
            <li key={o.href}>
              <Link href={o.href} className="flex min-h-11 items-center text-sm text-accent hover:underline lg:min-h-9">
                {o.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

/** A bulleted list inside a section. */
export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="grid list-disc gap-1.5 pl-5 marker:text-ink-3">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** A link inside a legal document. */
export function DocLink({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http") || href.startsWith("mailto:");
  return external ? (
    <a href={href} className="font-medium text-accent hover:underline" {...(href.startsWith("http") ? { rel: "noreferrer" } : {})}>
      {children}
    </a>
  ) : (
    <Link href={href} className="font-medium text-accent hover:underline">
      {children}
    </Link>
  );
}
