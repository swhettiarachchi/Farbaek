import Link from "next/link";
import type { ReactNode } from "react";
import { SiteThumb } from "./site-thumb";

/**
 * A project as a card: a live picture of its site above its name. The
 * picture sits inside the 20px card with an 8px inset and 12px corners,
 * so the curves stay concentric (ADR 0008's shape lock).
 */
export function ProjectCard({
  id,
  name,
  description,
  meta,
  compact = false,
}: {
  id: string;
  name: string;
  description?: string | null;
  meta?: ReactNode;
  compact?: boolean;
}) {
  return (
    <Link
      href={`/app/projects/${id}`}
      className="group flex h-full flex-col rounded-md border border-line bg-surface p-2 shadow-e1 transition-[box-shadow,transform,border-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1 hover:border-accent/25 hover:shadow-e3 active:translate-y-0 active:scale-[0.99]"
    >
      <SiteThumb src={`/app/projects/${id}/thumbnail`} name={name} className="ring-1 ring-line/80" />
      <span className={`flex flex-1 flex-col px-2.5 ${compact ? "pb-2 pt-3" : "pb-3 pt-4"}`}>
        <span className="text-[0.96875rem] font-medium tracking-[-0.01em] transition-colors duration-200 group-hover:text-accent">{name}</span>
        {!compact ? <span className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-2">{description || "No description."}</span> : null}
        {meta ? <span className={`mt-auto text-xs text-ink-3 tabular ${compact ? "pt-1.5" : "pt-4"}`}>{meta}</span> : null}
      </span>
    </Link>
  );
}
