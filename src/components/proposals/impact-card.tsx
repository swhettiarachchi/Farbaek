"use client";

import { BrowserIcon, FileArrowUpIcon, FlaskIcon, GraphIcon, PathIcon, WarningCircleIcon, WarningIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { analyzeImpactAction, type ImpactState } from "@/app/app/impact-actions";
import { buttonClasses } from "@/components/ui/button";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function Group({ icon: GroupIcon, title, items, tone = "plain" }: { icon: Icon; title: string; items: { path: string; note?: string }[]; tone?: "plain" | "warning" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-medium">
        <GroupIcon size={16} weight="bold" className={tone === "warning" ? "text-approval" : "text-ink-3"} aria-hidden />
        {title} <span className="font-normal text-ink-3 tabular">({items.length.toLocaleString("en-US")})</span>
      </p>
      <ul className="mt-1.5 grid gap-1 pl-6">
        {items.map((i) => (
          <li key={i.path} className="min-w-0 text-sm">
            <span className="break-all font-mono text-xs">{i.path}</span>
            {i.note ? <span className="text-xs text-ink-3"> {i.note}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Impact analysis on a change's review (ADR 0085): what else in the project
 * reaches the files it touches, found by reading imports. Asked for, not
 * computed on every visit; read-only.
 */
export function ImpactCard({ taskId, disabledReason }: { taskId: string; disabledReason: string | null }) {
  const [state, setState] = useState<ImpactState | null>(null);
  const [pending, start] = useTransition();
  const run = () => start(async () => setState(await analyzeImpactAction({ taskId })));
  const r = state?.status === "done" ? state.result : null;

  return (
    <section aria-labelledby="impact-title" className="grid gap-4 rounded-md border border-line bg-surface-raised/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="impact-title" className="flex items-center gap-2 text-base font-medium">
          <GraphIcon size={18} className="text-ink-3" aria-hidden /> What this change reaches
        </h3>
        {state?.status === "done" && state.sample ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong/60 px-2.5 py-0.5 text-xs text-ink-2">
            <FlaskIcon size={12} aria-hidden /> Sample: included in Max 2x and up
          </span>
        ) : null}
      </div>

      {!r ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={run} disabled={pending || Boolean(disabledReason)} className={buttonClasses("secondary", "sm")}>
            <PathIcon size={16} aria-hidden /> {pending ? "Reading the project…" : "Show what this change reaches"}
          </button>
          <span className="text-xs text-ink-3">{disabledReason ?? "The files that import what it touches, the pages and tests they reach, and what no test reaches."}</span>
        </div>
      ) : (
        <>
          <p className="text-[0.9375rem] leading-relaxed">
            {r.direct.length + r.further.length === 0
              ? "Nothing else in the project imports what this change touches."
              : `${plural(r.direct.length, "file imports", "files import")} what this change touches${r.further.length ? `, and ${plural(r.further.length, "more file reaches", "more files reach")} it through them` : ""}.`}{" "}
            {r.pages.length ? `${plural(r.pages.length, "page", "pages")} ${r.pages.length === 1 ? "is" : "are"} affected. ` : ""}
            {r.tests.length ? `${plural(r.tests.length, "test reaches", "tests reach")} it.` : "No test reaches it."}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Group icon={FileArrowUpIcon} title="Imported by" items={r.direct.map((d) => ({ path: d.path, note: `imports ${d.via}` }))} />
            <Group icon={PathIcon} title="Further away" items={r.further.map((d) => ({ path: d.path, note: `through ${d.via}` }))} />
            <Group icon={BrowserIcon} title="Pages it reaches" items={r.pages.map((path) => ({ path }))} />
            <Group icon={FlaskIcon} title="Tests that reach it" items={r.tests.map((path) => ({ path }))} />
            <Group icon={WarningIcon} tone="warning" title="Not reached by any test" items={r.untested.map((path) => ({ path }))} />
          </div>
          <p className="text-xs leading-relaxed text-ink-3">
            Found by reading import statements in JavaScript and TypeScript files, and script and stylesheet tags in HTML, up to three steps away; {plural(r.scanned, "file was", "files were")} read.
            {r.alias ? ` ${r.alias.assumed ? "No path aliases are set, so" : "From the project's config,"} ${r.alias.prefix} is read as ${r.alias.target || "the project's root"}.` : ""}
            {r.truncated ? " The project is large, so not every file was read: there may be more." : ""} Imports built at run time, and other languages, aren&apos;t followed.
          </p>
        </>
      )}
      {state?.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}
    </section>
  );
}
