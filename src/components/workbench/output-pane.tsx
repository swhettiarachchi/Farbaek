"use client";

/**
 * The Output pane of Build's workspace (stage 202, ADR 0219): what the agent ran and what came out of it, the files it
 * changed, and the latest check of the result. Everything here was recorded by the run or by the checks; a quiet run shows
 * nothing rather than something made up.
 *
 * It is not a terminal. Typing commands needs a test space, a private throwaway computer, and that has its own screen:
 * this pane links to it instead of drawing a prompt that can't run anything.
 */
import { ArrowSquareOutIcon, FileIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { StatusBadge, StatusGlyph, type Status } from "@/components/ui/status-badge";
import type { ChangedFile, RanCommand } from "@/core/agent/run-phase";
import type { WorkbenchCheck } from "@/server/workbench/types";

type Tab = "commands" | "files" | "checks";

/** How a command ended, as one of the kinds every status in Farbaek uses (ADR 0183). */
function ending(code: number | null): { kind: Status; words: string } {
  if (code === 0) return { kind: "done", words: "Finished" };
  // A command is recorded once it has ended, so no exit code means it was cut off or timed out, never that it is still going.
  if (code === null) return { kind: "unverified", words: "No result recorded" };
  return { kind: "failed", words: `Failed, exit code ${code}` };
}

const CHECK: Record<string, { kind: Status; words: string }> = {
  verified: { kind: "verified", words: "Passed" },
  partially_verified: { kind: "attention", words: "Partly passed" },
  failed: { kind: "failed", words: "Failed" },
  unverified: { kind: "unverified", words: "Not checked" },
};

export function OutputPane({
  taskId,
  commands,
  changed,
  check,
  live,
  hasRun,
  demo,
  onOpenFile,
}: {
  taskId: string | null;
  commands: RanCommand[];
  changed: ChangedFile[];
  check: WorkbenchCheck | null;
  live: boolean;
  hasRun: boolean;
  demo: boolean;
  onOpenFile: (path: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("commands");
  const tabs: { id: Tab; label: string; count: number | null }[] = [
    { id: "commands", label: "Commands", count: commands.length || null },
    { id: "files", label: "Changed files", count: changed.length || null },
    { id: "checks", label: "Checks", count: null },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2 [scrollbar-width:none]">
        <div role="tablist" aria-label="Output" className="flex items-center gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`output-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="output-panel"
              onClick={() => setTab(t.id)}
              className="inline-flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm text-ink-2 transition-colors duration-150 hover:text-ink aria-selected:bg-surface aria-selected:font-medium aria-selected:text-ink aria-selected:shadow-e1 pointer-coarse:min-h-11"
            >
              {t.label}
              {t.count ? <span className="tabular text-xs text-ink-3">{t.count}</span> : null}
            </button>
          ))}
        </div>
        <Link href="/app/sandbox" className="ml-auto inline-flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs text-ink-3 hover:text-ink pointer-coarse:min-h-11" title="A test space is where you run commands yourself">
          Run commands in a test space <ArrowSquareOutIcon size={14} weight="bold" aria-hidden />
        </Link>
      </div>

      <div id="output-panel" role="tabpanel" aria-labelledby={`output-tab-${tab}`} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40">
        {tab === "commands" ? (
          commands.length === 0 ? (
            <Empty>
              {demo
                ? "The sample workspace has no runs, so there is nothing here. In a real workspace this lists every command the agent ran, with what it printed."
                : !hasRun
                  ? "No agent has worked on this request yet. When one does, every command it runs shows here with what it printed."
                  : live
                    ? "The agent hasn't run a command yet."
                    : "This run didn't run any commands."}
            </Empty>
          ) : (
            <ol className="grid gap-3">
              {commands.map((c, i) => {
                const end = ending(c.exitCode);
                return (
                  <li key={`${i}:${c.command}`} className="overflow-hidden rounded-md border border-line bg-surface shadow-e1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2">
                      <code className="min-w-0 flex-1 break-all font-mono text-sm text-ink">{c.command}</code>
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-ink-2">
                        <StatusGlyph status={end.kind} size={14} /> {end.words}
                      </span>
                    </div>
                    {c.output ? (
                      <pre tabIndex={0} aria-label={`What ${c.command} printed`} className="max-h-72 overflow-auto bg-media p-3 font-mono text-xs leading-relaxed text-media-ink outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60">
                        {c.output}
                      </pre>
                    ) : (
                      <p className="px-3 py-2 text-xs text-ink-3">It printed nothing.</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )
        ) : null}

        {tab === "files" ? (
          changed.length === 0 ? (
            <Empty>{hasRun ? "The agent hasn't changed any files in its copy." : "The files an agent changes in its copy are listed here. Nothing is in your project until you review and apply the change."}</Empty>
          ) : (
            <div className="grid gap-2">
              <p className="px-1 text-xs leading-relaxed text-ink-3">Changed in the agent&apos;s copy. A file opens as it is in your project now; the change itself is in the review.</p>
              <ul className="grid gap-1">
                {changed.map((f) => (
                  <li key={f.path}>
                    <button type="button" onClick={() => onOpenFile(f.path)} className="flex min-h-10 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-ink-2 hover:bg-surface hover:text-ink pointer-coarse:min-h-11">
                      <FileIcon size={16} className="shrink-0 text-ink-3" aria-hidden />
                      <span className="min-w-0 flex-1 break-all font-mono text-xs text-ink">{f.path}</span>
                      <span className="shrink-0 text-xs text-ink-3">
                        {f.change === "written" ? "Written" : "Edited"}
                        {f.times > 1 ? `, ${f.times} times` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : null}

        {tab === "checks" ? (
          !check ? (
            <Empty>{taskId ? "This request's result hasn't been checked yet. Checks run after a change is applied." : "Checks run on a request's result, after its change is applied."}</Empty>
          ) : (
            <div className="grid gap-2 rounded-md border border-line bg-surface p-4 shadow-e1">
              <div className="flex flex-wrap items-center gap-3">
                {check.status === "running" ? (
                  <StatusBadge status="working" label="Checks are running" />
                ) : check.status === "failed" ? (
                  <StatusBadge status="failed" label="The checks couldn't run" />
                ) : (
                  <StatusBadge status={(CHECK[check.result ?? "unverified"] ?? CHECK.unverified!).kind} label={(CHECK[check.result ?? "unverified"] ?? CHECK.unverified!).words} />
                )}
                <p className="text-sm text-ink-2">The latest check of this request&apos;s result.</p>
              </div>
              {check.failure ? <p className="text-sm leading-relaxed text-ink-2">{check.failure}</p> : null}
              {taskId ? (
                <Link href={`/app/tasks/${taskId}`} className="inline-flex min-h-10 w-fit items-center gap-1.5 text-sm font-medium text-ink underline underline-offset-4">
                  Each check and its proof <ArrowSquareOutIcon size={14} weight="bold" aria-hidden />
                </Link>
              ) : null}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mx-auto max-w-md px-2 py-6 text-center text-sm leading-relaxed text-ink-3">{children}</p>;
}
