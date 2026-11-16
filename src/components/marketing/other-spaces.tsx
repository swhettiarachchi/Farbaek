import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { SPACES, type Space } from "@/components/site/spaces";
import { Container } from "@/components/ui/container";
import { PART_TITLE } from "@/components/ui/titles";

/**
 * The end of every space's page (ADR 0214): the other three spaces, so a visitor moves through the platform without
 * going back to the homepage.
 */
export function OtherSpaces({ current }: { current: Space["id"] }) {
  return (
    <section aria-labelledby="other-spaces-title" className="border-t border-line bg-canvas-2/50 py-14 sm:py-20">
      <Container>
        <h2 id="other-spaces-title" className={PART_TITLE}>
          The rest of Farbaek
        </h2>
        <ul className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-3 sm:gap-4">
          {SPACES.filter((s) => s.id !== current).map((s) => {
            const SpaceIcon = s.icon;
            return (
              <li key={s.id}>
                <Link
                  href={s.page}
                  className="group flex h-full flex-col rounded-md border border-line bg-surface p-5 shadow-e1 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-e2"
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-canvas-2 text-ink-2 ring-1 ring-line transition-colors duration-200 group-hover:text-accent">
                    <SpaceIcon size={20} aria-hidden />
                  </span>
                  <span className="mt-4 text-title-4 font-medium tracking-[-0.01em] text-ink">{s.name}</span>
                  <span className="mt-1.5 text-sm leading-relaxed text-ink-2">{s.promise}</span>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium text-accent">
                    Explore {s.name}
                    <ArrowRightIcon size={14} weight="bold" aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
