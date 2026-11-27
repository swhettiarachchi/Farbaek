import { BlocksIcon, FolderSimpleIcon } from "@/components/icons";
import Link from "next/link";
import type { ReactNode } from "react";
import { PlacesRail } from "@/components/app/app-nav";
import { BrandLogo } from "@/components/brand/brand-logo";
import { FOCUSED_TITLE } from "@/components/ui/titles";

/**
 * The frame of Build's workspace (stage 202, ADR 0219): it fills the screen, as Chat and every signed-in page do (ADR 0230).
 *
 * On a wide screen the places of Farbaek are a rail at the left, the same list every frame draws (stage 287, ADR 0295),
 * and the header names the project. On a phone the panes need the whole width, so the header keeps the way home.
 *
 * Own-frame pages get none of the app's chrome, so this provides the skip link, the one `h1`, `main` and the ways out.
 */
export function WorkbenchStage({ heading, name, skip, children }: { heading: string; name: string; skip: { href: string; label: string }; children: ReactNode }) {
  return (
    <div className="chat-root relative flex h-[100dvh] overflow-hidden bg-canvas text-ink [--tab-bar:0px]">
      <a href={skip.href} className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-sm text-on-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        {skip.label}
      </a>

      <PlacesRail />

      <main id="main" className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 sm:px-3">
          {/* The rail carries the way home on a wide screen. */}
          <span className="lg:hidden">
            <Link href="/app" aria-label="Farbaek, Home" title="Home" className="tap inline-flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-surface-raised">
              <BrandLogo height={28} />
            </Link>
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:pl-2">
            <BlocksIcon size={16} weight="fill" className="shrink-0 text-spark-leaf" aria-hidden />
            <h1 className={`sr-only ${FOCUSED_TITLE}`}>{heading}</h1>
            <p aria-hidden className="truncate text-sm font-medium text-ink sm:text-base">
              {name}
            </p>
          </div>
          {/* On a phone, the way to another project. On a wide screen the rail has Build and Projects. */}
          <span className="lg:hidden">
            <Link href="/app/build#projects" className="tap inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-ink-2 hover:bg-surface-raised hover:text-ink">
              <FolderSimpleIcon size={16} weight="bold" aria-hidden />
              <span className="max-sm:sr-only">Projects</span>
            </Link>
          </span>
        </header>
        {children}
      </main>
    </div>
  );
}
