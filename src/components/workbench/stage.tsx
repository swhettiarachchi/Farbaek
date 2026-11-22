import { ChatCircleTextIcon, FilmSlateIcon, FolderSimpleIcon, HammerIcon, HouseSimpleIcon, ImageSquareIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { STAGE, STAGE_WINDOW, StageLight } from "@/components/ui/stage-window";
import { FOCUSED_TITLE } from "@/components/ui/titles";

/** Farbaek AI's spaces, as Chat's sidebar and the studios' headers show them (ADR 0217). */
const SPACES = [
  { href: "/app/chat", label: "Chat", icon: ChatCircleTextIcon, tone: "text-accent" },
  { href: "/app/images", label: "Images", icon: ImageSquareIcon, tone: "text-spark-rose" },
  { href: "/app/video", label: "Video", icon: FilmSlateIcon, tone: "text-spark-aqua" },
  { href: "/app/workbench", label: "Build", icon: HammerIcon, tone: "text-spark-leaf" },
] as const;

/**
 * The frame of Build's workspace (stage 202, ADR 0219), the same one Chat stands in (ADR 0218): on a wide screen a rounded
 * window on a pale stage, with the spectrum's light glowing from behind its edges, still until something inside it is busy
 * (`aria-busy`), when it travels slowly round. On a phone it is edge to edge. The header names the place, links back to
 * Farbaek and to the other spaces, each in its colour.
 *
 * Own-frame pages get none of the app's chrome, so this provides the skip link, the one `h1`, `main` and the ways out.
 */
export function WorkbenchStage({ heading, name, skip, projects = true, children }: { heading: string; name: string; skip: { href: string; label: string }; projects?: boolean; children: ReactNode }) {
  return (
    <div className={`chat-root relative h-[100dvh] overflow-hidden bg-canvas text-ink [--tab-bar:0px] ${STAGE}`}>
      <StageLight />
      <a href={skip.href} className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-sm text-on-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        {skip.label}
      </a>

      <main id="main" className={`relative flex h-full flex-col overflow-hidden ${STAGE_WINDOW}`}>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 sm:px-3">
          <Link href="/app" aria-label="Farbaek, Home" title="Home" className="tap inline-flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-surface-raised">
            <BrandLogo height={28} />
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <HammerIcon size={16} weight="fill" className="shrink-0 text-spark-leaf" aria-hidden />
            <h1 className={`sr-only ${FOCUSED_TITLE}`}>{heading}</h1>
            <p aria-hidden className="truncate text-sm font-medium text-ink sm:text-base">
              {name}
            </p>
          </div>
          {projects ? (
            <Link href="/app/workbench" className="tap inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-ink-2 hover:bg-surface-raised hover:text-ink">
              <FolderSimpleIcon size={16} weight="bold" aria-hidden />
              <span className="max-sm:sr-only">Projects</span>
            </Link>
          ) : null}
          <nav aria-label="Farbaek AI" className="hidden shrink-0 items-center gap-0.5 rounded-full bg-canvas-2 p-1 ring-1 ring-line lg:flex">
            {SPACES.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                aria-current={s.label === "Build" ? "page" : undefined}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm text-ink-2 transition-colors duration-150 hover:text-ink pointer-coarse:min-h-11 aria-[current=page]:bg-surface aria-[current=page]:font-medium aria-[current=page]:text-ink aria-[current=page]:shadow-e1"
              >
                <s.icon size={14} weight="fill" className={s.tone} aria-hidden />
                {s.label}
              </Link>
            ))}
          </nav>
          <Link href="/app" aria-label="Back to Farbaek" title="Back to Farbaek" className="tap hidden size-10 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-raised hover:text-ink lg:inline-flex">
            <HouseSimpleIcon size={20} aria-hidden />
          </Link>
        </header>
        {children}
      </main>
    </div>
  );
}
