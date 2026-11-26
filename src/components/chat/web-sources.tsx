"use client";

/**
 * Live web search in an answer (stage 205, ADR 0222; stage 206, ADR 0223): a plain status line while Farbaek checks the web,
 * then the sources. The answer itself carries small links where it cites a page (markdown-view.tsx), so the list under it stays
 * closed until someone wants it: one button with what it holds, and beside it the sites the answer rests on. Opened, it lists
 * the pages the answer cites, then the others Farbaek checked, each with its site, its dates, and whether the cited names and
 * numbers were found on it. A search that didn't work, or was switched off, is said plainly with the status badge for it;
 * nothing pretends the web was checked, and an answer that needed no search shows nothing here.
 */
import { ArrowUpRightIcon, CaretDownIcon, GlobeIcon } from "@/components/icons";
import { useId, useState } from "react";
import { StatusBadge, StatusGlyph } from "@/components/ui/status-badge";
import type { SearchMeta, WebSource } from "@/core/web/sources";

export interface LiveSearch {
  stage: "planning" | "searching" | "reading" | "checking" | "done" | "failed" | "off" | "skipped";
  queries?: string[];
  pages?: number;
  /** 2 while a deep task looks again for what its first round missed. */
  round?: number;
}

/** What the status line says while the web is being checked; null once it's done. What is happening, never how the model thinks. */
export function searchLine(search: LiveSearch | null | undefined): string | null {
  if (!search) return null;
  const again = (search.round ?? 1) > 1;
  if (search.stage === "planning") return "Checking the web";
  if (search.stage === "searching") {
    const first = search.queries?.[0];
    if (again) return first ? `Looking again for “${first}”` : "Looking again";
    return first ? `Searching the web for “${first}”` : "Searching the web";
  }
  if (search.stage === "reading") {
    const pages = search.pages ?? 0;
    if (again) return pages === 1 ? "Reading 1 more page" : `Reading ${pages} more pages`;
    return pages === 1 ? "Reading 1 page" : `Reading ${pages} pages`;
  }
  if (search.stage === "checking") return "Checking what's still missing";
  return null;
}

// Fixed language and time zone, so the server's first render and the browser's agree.
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function day(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? DAY.format(new Date(t)) : null;
}

/** "bbc.co.uk, reuters.com and 2 more", from the sources in order, each site once. */
export function siteList(sources: readonly WebSource[], shown = 2): string {
  const sites = [...new Set(sources.map((s) => s.site).filter(Boolean))];
  const first = sites.slice(0, shown).join(", ");
  const rest = sites.length - shown;
  return rest > 0 ? `${first} and ${rest} more` : first;
}

const SUPPORT: Partial<Record<NonNullable<WebSource["support"]>, { status: "done" | "info" | "attention"; text: string }>> = {
  matched: { status: "done", text: "The names and numbers cited are on this page." },
  partly: { status: "info", text: "Some of the names or numbers cited weren't found on this page." },
  unmatched: { status: "attention", text: "The names and numbers cited weren't found on this page. Open it to check." },
};

function SourceList({ title, sources }: { title: string | null; sources: readonly WebSource[] }) {
  return (
    <div>
      {title ? <h5 className="text-xs font-medium text-ink-3">{title}</h5> : null}
      <ol className="mt-1 grid list-decimal gap-2.5 pl-6 text-sm marker:text-xs marker:text-ink-3">
        {sources.map((s) => {
          const published = day(s.published);
          const updated = day(s.updated);
          const support = s.cited && s.support ? SUPPORT[s.support] : undefined;
          return (
            <li key={s.n} value={s.n} className="min-w-0 pl-1">
              <a href={s.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="group/src inline-flex max-w-full items-baseline gap-1 text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                <span className="line-clamp-2 [overflow-wrap:anywhere]">{s.title || s.site}</span>
                <ArrowUpRightIcon size={14} weight="bold" className="shrink-0 translate-y-0.5 text-ink-3 group-hover/src:text-ink" aria-hidden />
              </a>
              <span className="block text-xs leading-relaxed text-ink-3">
                {s.site}
                {published ? `, ${published}` : ""}
                {updated && updated !== published ? `, updated ${updated}` : ""}
                {s.read ? "" : ". From the search result only"}
              </span>
              {support ? (
                <span className="mt-0.5 flex items-start gap-1.5 text-xs leading-relaxed text-ink-3">
                  <StatusGlyph status={support.status} size={14} className="mt-0.5 shrink-0" />
                  {support.text}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function WebSources({ search }: { search: SearchMeta }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  if (search.status === "skipped") return null;
  if (search.status === "failed") {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-3">
        <StatusBadge status="attention" label="Web not checked" />
        <span>{search.reason ? `${search.reason.charAt(0).toUpperCase()}${search.reason.slice(1)}.` : "Farbaek couldn't check the web for this answer."}</span>
      </div>
    );
  }
  if (search.status === "off") {
    return (
      <div className="mt-3">
        <StatusBadge status="off" label="Web search off" />
      </div>
    );
  }
  if (search.sources.length === 0) return <p className="mt-3 text-sm text-ink-3">The web search found no pages for this.</p>;

  // Once the answer is written, each source says whether the answer cites it; until then, and for answers from before, none does.
  const judged = search.sources.some((s) => s.cited !== undefined);
  const cited = search.sources.filter((s) => s.cited);
  const others = search.sources.filter((s) => !s.cited);
  const unused = judged && cited.length === 0;
  const label = judged && cited.length > 0 ? (cited.length === 1 ? "1 source" : `${cited.length} sources`) : "Sources";
  const beside = unused ? (others.length === 1 ? "1 page checked, not cited in the answer" : `${others.length} pages checked, none cited in the answer`) : siteList(judged ? cited : search.sources);

  return (
    <section aria-label="Sources" className="mt-3 max-w-2xl">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={open ? panel : undefined}
          className="tap inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-medium text-ink-2 transition-colors duration-150 hover:border-line-2 hover:text-ink pointer-coarse:min-h-11"
        >
          <GlobeIcon size={14} weight="bold" className="text-ink-3" aria-hidden />
          <span className="tabular">{label}</span>
          <CaretDownIcon size={14} weight="bold" className={`text-ink-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        <span className="min-w-0 truncate text-xs text-ink-3">{beside}</span>
      </div>
      {open ? (
        <div id={panel} className="mt-2 grid gap-4 rounded-md border border-line bg-surface p-4 motion-safe:animate-[chat-rise_240ms_cubic-bezier(0.16,1,0.3,1)_both]">
          {judged && cited.length > 0 ? <SourceList title={others.length > 0 ? "Cited in the answer" : null} sources={cited} /> : null}
          {judged && others.length > 0 ? <SourceList title={cited.length > 0 ? "Also checked" : null} sources={others} /> : null}
          {!judged ? <SourceList title={null} sources={search.sources} /> : null}
        </div>
      ) : null}
    </section>
  );
}
