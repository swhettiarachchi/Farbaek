import { BookOpenTextIcon, FileArrowUpIcon, GitDiffIcon, ListChecksIcon, TreeStructureIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { LocalTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import type { WhyGraph } from "@/core/insights/why-graph";

/** Each fact's icon names where it comes from: the file's start, a change, a doc or a test. */
const FACT_ICON: Record<WhyGraph["facts"][number]["kind"], Icon> = {
  origin: FileArrowUpIcon,
  change: GitDiffIcon,
  doc: BookOpenTextIcon,
  test: ListChecksIcon,
};

/**
 * Why this file is like this (ADR 0123): facts from the workspace's records,
 * each with its source. Inferences are marked; edits nobody gave a reason for
 * are counted, not explained.
 */
export function WhyCard({ graph, scanned }: { graph: WhyGraph; scanned: boolean }) {
  return (
    <section aria-labelledby="why-title" className="grid gap-4 rounded-md border border-line bg-surface p-4 shadow-e1 sm:p-5">
      <h3 id="why-title" className="flex items-center gap-2 text-base font-medium">
        <TreeStructureIcon size={20} className="shrink-0 text-ink-3" aria-hidden /> Why this file is like this
      </h3>
      <p className="text-sm leading-relaxed text-ink-2">From what Farbaek records: the tasks whose changes wrote it, the docs that name it and the tests that reach it. Each line says where it comes from.</p>
      {graph.facts.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing recorded explains this file yet.</p>
      ) : (
        <ol className="grid gap-2">
          {graph.facts.map((f, i) => {
            const inferred = "inferred" in f && f.inferred;
            const FactIcon = FACT_ICON[f.kind];
            return (
              <li key={i} className="flex gap-2.5 rounded-sm border border-line px-3 py-2.5">
                <FactIcon size={16} weight="bold" className="mt-1 shrink-0 text-ink-3" aria-hidden />
                <div className="grid min-w-0 flex-1 gap-1">
                  <p className="text-sm leading-relaxed">
                    {f.text}
                    {inferred ? (
                      <span className="ml-1.5 inline-flex align-middle">
                        <StatusBadge status="unverified" label="Inferred" />
                      </span>
                    ) : null}
                  </p>
                  {f.kind === "change" && f.detail ? <p className="text-sm leading-relaxed text-ink-2">{f.detail}</p> : null}
                  {f.kind === "doc" ? <blockquote className="border-l-2 border-line pl-3 text-sm leading-relaxed break-words text-ink-2">{f.quote}</blockquote> : null}
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                    Source:{" "}
                    {f.source.href ? (
                      <Link href={f.source.href} className="inline-flex min-h-11 items-center break-all underline decoration-line-strong/50 underline-offset-4 hover:text-ink">
                        {f.source.label}
                      </Link>
                    ) : (
                      f.source.label
                    )}
                    {"at" in f ? (
                      <>
                        <span aria-hidden>·</span>
                        <LocalTime iso={f.at} />
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {graph.unexplainedEdits > 0 ? (
        <p className="text-sm leading-relaxed text-ink-2">
          {graph.unexplainedEdits === 1 ? "1 saved edit has" : `${graph.unexplainedEdits} saved edits have`} no recorded reason: made in the editor rather than through a task.
        </p>
      ) : null}
      <p className="text-xs leading-relaxed text-ink-3">
        {scanned ? "" : "The project is too large to read every doc and test, so those weren't checked. "}Farbaek can&apos;t see commits, issues or discussions outside it, so anything decided there isn&apos;t here.
      </p>
    </section>
  );
}
