"use client";

/**
 * Live web search in an answer (stage 205, ADR 0222): a plain status line while Farbaek checks the web, then the sources the
 * answer used, each a link with its site and date. A search that didn't work, or was switched off, is said plainly with the
 * status badge for it; nothing pretends the web was checked.
 */
import { useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { SearchMeta } from "@/core/web/sources";

export interface LiveSearch {
  stage: "planning" | "searching" | "reading" | "done" | "failed" | "off";
  queries?: string[];
  pages?: number;
}

/** What the status line says while the web is being checked; null once it's done. */
export function searchLine(search: LiveSearch | null | undefined): string | null {
  if (!search) return null;
  if (search.stage === "planning") return "Checking the web";
  if (search.stage === "searching") return search.queries?.[0] ? `Searching the web for “${search.queries[0]}”` : "Searching the web";
  if (search.stage === "reading") return search.pages === 1 ? "Reading 1 page" : `Reading ${search.pages ?? 0} pages`;
  return null;
}

// Fixed language and time zone, so the server's first render and the browser's agree.
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function day(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? DAY.format(new Date(t)) : null;
}

const SHOWN = 4;

export function WebSources({ search }: { search: SearchMeta }) {
  const [all, setAll] = useState(false);
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
  const shown = all ? search.sources : search.sources.slice(0, SHOWN);
  return (
    <section aria-label="Sources" className="mt-3 max-w-2xl">
      <h4 className="text-xs font-medium text-ink-3">Sources</h4>
      <ol className="mt-1 grid list-decimal gap-1.5 pl-5 text-sm marker:text-ink-3">
        {shown.map((s) => {
          const date = day(s.published);
          return (
            <li key={s.n} className="min-w-0 pl-1">
              <a href={s.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="block truncate text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                {s.title}
              </a>
              <span className="block truncate text-xs text-ink-3">
                {s.site}
                {date ? ` · ${date}` : ""}
                {s.read ? "" : ", from the search result only"}
              </span>
            </li>
          );
        })}
      </ol>
      {search.sources.length > SHOWN ? (
        <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="tap mt-1 inline-flex min-h-10 items-center text-sm font-medium text-accent underline-offset-4 hover:underline">
          {all ? "Show fewer" : `Show all ${search.sources.length} sources`}
        </button>
      ) : null}
    </section>
  );
}
