/**
 * Read-only source view with line numbers and linkable lines (#L12). It
 * scrolls sideways inside its own frame so the page never does. Syntax
 * highlighting and editing arrive with the CodeMirror editor (ADR 0002).
 */
export function CodeView({ content, label }: { content: string; label: string }) {
  const lines = content.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  const digits = String(lines.length).length;
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="max-h-[70vh] overflow-auto overscroll-contain" tabIndex={0} role="region" aria-label={label}>
        <pre className="min-w-max py-3 font-mono text-[13px] leading-6 text-ink [tab-size:2]">
          <code>
            {lines.map((line, i) => (
              <span key={i} id={`L${i + 1}`} className="flex scroll-mt-24 target:bg-accent/[0.08]">
                <a
                  href={`#L${i + 1}`}
                  aria-label={`Line ${i + 1}`}
                  className="sticky left-0 shrink-0 select-none bg-surface pr-4 pl-4 text-right text-ink-3 hover:text-ink"
                  style={{ width: `${digits + 3}ch` }}
                >
                  {i + 1}
                </a>
                <span className="pr-6 whitespace-pre">{line || " "}</span>
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
