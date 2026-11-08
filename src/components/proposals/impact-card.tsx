"use client";

import { GraphIcon, PathIcon, WarningCircleIcon, WarningIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { analyzeImpactAction, type ImpactState } from "@/app/app/impact-actions";
import { buttonClasses } from "@/components/ui/button";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function Group({ title, items, tone = "plain" }: { title: string; items: { path: string; note?: string }[]; tone?: "plain" | "warning" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-medium">
        {tone === "warning" ? <WarningIcon size={16} weight="bold" className="text-approval" aria-hidden /> : null}
        {title}
      </p>
      <ul className={`mt-1.5 grid gap-1 ${tone === "warning" ? "pl-6" : ""}`}>
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
      </div>
      {state?.status === "done" && state.sample ? (
        <p className="text-sm leading-relaxed text-ink-2">This is a sample from the demo workspace. It&apos;s included in Max 2x and up.</p>
      ) : null}

      {!r ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={run} disabled={pending || Boolean(disabledReason)} className={buttonClasses("secondary", "sm")}>
            <PathIcon size={16} aria-hidden /> {pending ? "Reading the project…" : "Show what this change reaches"}
          </button>
          <span className="text-xs text-ink-3">{disabledReason ?? "The files that use what it touches, the pages and tests they reach, and what no test reaches."}</span>
        </div>
      ) : (
        <>
          <p className="text-[0.9375rem] leading-relaxed">
            {r.direct.length + r.further.length === 0
              ? "Nothing else in the project uses what this change touches."
              : `${plural(r.direct.length, "file uses", "files use")} what this change touches${r.further.length ? `, and ${plural(r.further.length, "more file reaches", "more files reach")} it through them` : ""}.`}{" "}
            {r.pages.length ? `${plural(r.pages.length, "page", "pages")} ${r.pages.length === 1 ? "is" : "are"} affected. ` : ""}
            {r.tests.length ? `${plural(r.tests.length, "test reaches", "tests reach")} it.` : "No test reaches it."}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Group title="Used directly by" items={r.direct.map((d) => ({ path: d.path, note: `uses ${d.via}` }))} />
            <Group title="Further away" items={r.further.map((d) => ({ path: d.path, note: `through ${d.via}` }))} />
            <Group title="Pages it reaches" items={r.pages.map((path) => ({ path }))} />
            <Group title="Tests that reach it" items={r.tests.map((path) => ({ path }))} />
            <Group tone="warning" title="Not reached by any test" items={r.untested.map((path) => ({ path }))} />
          </div>
          <p className="text-xs leading-relaxed text-ink-3">
            Farbaek reads which files load which, from the code itself, up to three steps away. It read {plural(r.scanned, "file", "files")}.
            {r.alias
              ? r.alias.assumed
                ? ` The project sets no path shortcuts, so Farbaek reads ${r.alias.prefix} as ${r.alias.target || "the project's top folder"}.`
                : ` In the project's settings, ${r.alias.prefix} stands for ${r.alias.target || "the project's top folder"}.`
              : ""}
            {r.truncated ? " The project is large, so not every file was read: there may be more." : ""} Files loaded only while the app runs aren&apos;t followed. Neither are languages other than JavaScript, TypeScript and HTML.
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
