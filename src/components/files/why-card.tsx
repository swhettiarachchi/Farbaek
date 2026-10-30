import { BookOpenTextIcon, FileArrowUpIcon, FlaskIcon, GitDiffIcon, QuestionIcon, TreeStructureIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { LocalTime } from "@/components/ui/local-time";
import type { WhyFact, WhyGraph } from "@/core/insights/why-graph";

const ICONS: Record<WhyFact["kind"], Icon> = { origin: FileArrowUpIcon, change: GitDiffIcon, doc: BookOpenTextIcon, test: FlaskIcon };

/**
 * Why this file is like this (ADR 0123): facts from the workspace's records,
 * each with its source. Inferences are marked; edits nobody gave a reason for
 * are counted, not explained.
 */
export function WhyCard({ graph, scanned }: { graph: WhyGraph; scanned: boolean }) {
  return (
    <section aria-labelledby="why-title" className="grid gap-4 rounded-md border border-line bg-surface p-4 shadow-e1 sm:p-5">
      <h3 id="why-title" className="flex items-center gap-2 text-base font-medium">
        <TreeStructureIcon size={18} className="text-ink-3" aria-hidden /> Why this file is like this
      </h3>
      <p className="text-sm leading-relaxed text-ink-2">From what Farbaek records: the tasks whose changes wrote it, the docs that name it and the tests that reach it. Each line says where it comes from.</p>
      {graph.facts.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing recorded explains this file yet.</p>
      ) : (
        <ol className="grid gap-2">
          {graph.facts.map((f, i) => {
            const FactIcon = ICONS[f.kind];
            const inferred = "inferred" in f && f.inferred;
            return (
              <li key={i} className={`grid gap-1 rounded-sm border px-3 py-2.5 ${inferred ? "border-dashed border-line-strong/60" : "border-line"}`}>
                <p className="flex items-start gap-2 text-sm leading-relaxed">
                  <FactIcon size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                  <span>
                    {f.text}
                    {inferred ? <span className="ml-1.5 rounded-full border border-dashed border-line-strong/60 px-2 py-0.5 text-xs text-ink-2">inferred</span> : null}
                  </span>
                </p>
                {f.kind === "change" && f.detail ? <p className="pl-6 text-sm leading-relaxed text-ink-2">{f.detail}</p> : null}
                {f.kind === "doc" ? <p className="pl-6 font-mono text-xs leading-relaxed break-words text-ink-2">{f.quote}</p> : null}
                <p className="flex flex-wrap items-center gap-x-2 pl-6 text-xs text-ink-3">
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
              </li>
            );
          })}
        </ol>
      )}
      {graph.unexplainedEdits > 0 ? (
        <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-2">
          <QuestionIcon size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
          {graph.unexplainedEdits === 1 ? "1 saved edit has" : `${graph.unexplainedEdits} saved edits have`} no recorded reason: made in the editor rather than through a task.
        </p>
      ) : null}
      <p className="text-xs leading-relaxed text-ink-3">
        {scanned ? "" : "The project is too large to read every doc and test, so those weren't checked. "}Farbaek can&apos;t see commits, issues or discussions outside it, so anything decided there isn&apos;t here.
      </p>
    </section>
  );
}
