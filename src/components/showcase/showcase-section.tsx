import Link from "next/link";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/marketing/section-heading";
import { CapabilityStatusPill, capabilityRows } from "./capabilities";
import { Showroom } from "./showroom";

/**
 * "What you can build": the homepage showroom of concept mockups (ADR 0031),
 * and what Farbaek does around the design, each with its status on this
 * deployment.
 */
export function ShowcaseSection() {
  return (
    <section id="showcase" aria-labelledby="showcase-title" className="overflow-x-clip py-20 lg:py-28">
      <Container>
        <SectionHeading id="showcase-title" title="Start from something like these.">
          Eight concepts, each with its own look, motion and purpose, the way Farbaek designs every build. Pick one and start a build like it.
        </SectionHeading>

        <div className="mt-12">
          <Showroom />
        </div>

        <p className="mt-6 max-w-[64ch] text-sm text-ink-3">
          Concept mockups drawn for this page. They show the kind of thing you can ask for; none of them is a live product.
        </p>

        <div className="mt-16 border-t border-line pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h3 className="max-w-[24ch] text-balance text-[1.6rem] font-medium leading-tight tracking-[-0.03em] sm:text-[1.9rem]">What every build comes with.</h3>
            <Link href="#status" className="inline-flex min-h-11 items-center text-sm font-medium text-ink-2 hover:text-ink">
              See what works today
            </Link>
          </div>
          <ul className="mt-8 grid gap-x-10 md:grid-cols-2">
            {capabilityRows().map((c) => (
              <li key={c.id} className="flex gap-4 border-t border-line py-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink-2 shadow-e1 ring-1 ring-line">
                  <c.icon size={20} aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h4 className="text-[1rem] font-medium tracking-[-0.01em]">{c.title}</h4>
                    <CapabilityStatusPill status={c.status} />
                  </div>
                  <p className="mt-1 text-[0.90625rem] leading-relaxed text-ink-2">{c.body}</p>
                  {c.waiting ? <p className="mt-1 text-xs text-ink-3">{c.waiting}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
