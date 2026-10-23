import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = { title: "Page not found" };

const WAYS_IN = [
  { href: "/#showcase", label: "See what people build", note: "The showroom" },
  { href: "/pricing", label: "Compare the plans", note: "Pricing" },
  { href: "/app", label: "Open your workspace", note: "Sign in if you need to" },
];

/**
 * The 404: the floating header, a lost orbit drawn in tokens, and three ways
 * back in. Still under reduced motion.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="overflow-x-clip">
        <Container className="grid min-h-[calc(100dvh-4rem)] items-center gap-12 py-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div>
            <h1 className="max-w-[14ch] text-[2.6rem] font-medium leading-[1.02] tracking-[-0.04em] sm:text-[3.6rem]">We can&apos;t find that page.</h1>
            <p className="mt-4 max-w-[46ch] text-lg leading-relaxed text-ink-2">The link may be old, or the page may not exist yet. Here are three ways back in.</p>
            <ul className="mt-8 grid max-w-[30rem] gap-2">
              {WAYS_IN.map((w) => (
                <li key={w.href}>
                  <Link
                    href={w.href}
                    className="group flex min-h-14 items-center justify-between gap-4 rounded-md border border-line bg-surface px-4 py-3 shadow-e1 transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-accent/25 hover:shadow-e2"
                  >
                    <span>
                      <span className="block font-medium group-hover:text-accent">{w.label}</span>
                      <span className="block text-sm text-ink-3">{w.note}</span>
                    </span>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-2 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-px group-hover:translate-x-0.5">
                      <ArrowUpRightIcon size={16} aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/" className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-ink-2 hover:text-ink">
              Or go back to the home page
            </Link>
          </div>

          {/* A drawn orbit with its satellite gone astray: decoration only. */}
          <div aria-hidden className="aurora relative mx-auto aspect-square w-full max-w-[420px]">
            <div className="dot-grid absolute inset-0" />
            <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full">
              <circle cx="200" cy="200" r="70" fill="var(--color-surface)" stroke="var(--color-line)" />
              <circle cx="200" cy="200" r="12" fill="var(--color-accent)" />
              <g className="origin-center motion-safe:animate-[core-orbit_24s_linear_infinite]" style={{ transformBox: "view-box" }}>
                <ellipse cx="200" cy="200" rx="170" ry="58" fill="none" stroke="var(--color-accent-2)" strokeOpacity="0.55" strokeDasharray="5 9" transform="rotate(-18 200 200)" />
              </g>
              <circle cx="352" cy="96" r="9" fill="var(--color-accent-2)" className="motion-safe:animate-[notfound-drift_6s_ease-in-out_infinite]" />
              <text x="200" y="320" textAnchor="middle" fill="var(--color-ink-3)" fontFamily="var(--font-geist), sans-serif" fontSize="15" fontWeight="500">
                404
              </text>
            </svg>
          </div>
        </Container>
      </main>
    </>
  );
}
