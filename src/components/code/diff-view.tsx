import type { DiffLine } from "@/content/samples";

const ROW: Record<DiffLine["kind"], { sign: string; sr: string; className: string }> = {
  context: { sign: " ", sr: "", className: "border-transparent" },
  removed: { sign: "-", sr: "Removed: ", className: "border-failed bg-failed/[0.07]" },
  added: { sign: "+", sr: "Added: ", className: "border-verified bg-verified/[0.08]" },
};

/** Unified diff with coloured gutters. Long lines wrap so phones never scroll sideways. */
export function DiffView({ lines, path }: { lines: DiffLine[]; path: string }) {
  return (
    <figure className="overflow-hidden rounded-md border border-line bg-surface">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 font-mono text-xs text-ink-3">
        <span className="truncate">{path}</span>
        <span className="shrink-0 tabular">
          <span className="text-verified">+{lines.filter((l) => l.kind === "added").length}</span>{" "}
          <span className="text-failed">-{lines.filter((l) => l.kind === "removed").length}</span>
        </span>
      </figcaption>
      <pre className="py-2 font-mono text-[12.5px] leading-[1.6]">
        <code>
          {lines.map((line, i) => {
            const row = ROW[line.kind];
            return (
              <span key={i} className={`block border-l-2 py-px pl-2 pr-3 whitespace-pre-wrap break-words ${row.className}`}>
                <span aria-hidden className="mr-2 inline-block w-2 select-none text-ink-3">
                  {row.sign}
                </span>
                {row.sr ? <span className="sr-only">{row.sr}</span> : null}
                {line.text}
              </span>
            );
          })}
        </code>
      </pre>
    </figure>
  );
}
