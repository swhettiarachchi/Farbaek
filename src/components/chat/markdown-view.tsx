"use client";

/**
 * An answer drawn from its Markdown (stage 199, ADR 0213): React elements only, never HTML from the model. Blocks are memoised by
 * their source, so while an answer streams only the block being written redraws. Code blocks carry their language, a copy button
 * and a download; tables scroll sideways inside their own frame; maths is the browser's own MathML.
 */
import { CheckIcon, CheckSquareIcon, CopyIcon, DownloadSimpleIcon, SquareIcon } from "@phosphor-icons/react";
import { createElement, memo, useDeferredValue, useMemo, type ReactNode } from "react";
import { useCopy } from "./primitives";
import { extensionFor, highlight, languageLabel, type TokenKind } from "@/core/chat/highlight";
import { parseMarkdown, type Block, type Inline } from "@/core/chat/markdown";
import { texToMath, type MathNode } from "@/core/chat/tex";

const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: "",
  keyword: "text-accent",
  type: "text-accent",
  string: "text-accent-2",
  number: "text-accent-2",
  comment: "italic text-ink-3",
  call: "font-medium text-ink",
  property: "text-ink-2",
  punct: "text-ink-2",
};

function mathElement(node: MathNode, key: number | string): ReactNode {
  const attrs: Record<string, string> = { ...(node.attrs ?? {}) };
  return createElement(node.tag, { key, ...attrs }, node.text ?? node.children?.map((c, i) => mathElement(c, i)));
}

export function MathView({ tex, display }: { tex: string; display: boolean }) {
  const tree = useMemo(() => texToMath(tex, display), [tex, display]);
  return createElement("math", { display: display ? "block" : "inline", "aria-label": tex }, mathElement(tree, 0));
}

function InlineView({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text":
            return n.v;
          case "strong":
            return (
              <strong key={i} className="font-semibold text-ink">
                <InlineView nodes={n.c} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <InlineView nodes={n.c} />
              </em>
            );
          case "del":
            return (
              <del key={i} className="text-ink-3">
                <InlineView nodes={n.c} />
              </del>
            );
          case "code":
            return (
              <code key={i} className="rounded-xs bg-surface-raised px-1.5 py-0.5 font-mono text-[0.875em] text-ink [overflow-wrap:anywhere]">
                {n.v}
              </code>
            );
          case "math":
            return <MathView key={i} tex={n.v} display={false} />;
          case "br":
            return <br key={i} />;
          case "link":
            return (
              <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="font-medium text-accent underline decoration-accent/35 underline-offset-[3px] hover:decoration-accent [overflow-wrap:anywhere]">
                <InlineView nodes={n.c} />
              </a>
            );
        }
      })}
    </>
  );
}

export function CodeBlock({ lang, code, open }: { lang: string; code: string; open: boolean }) {
  const [copied, copyText] = useCopy();
  const tokens = useMemo(() => highlight(code, lang), [code, lang]);
  const copy = () => void copyText(code);
  const download = () => {
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `code.${extensionFor(lang)}`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  return (
    <figure className="my-4 overflow-hidden rounded-md border border-line bg-surface-sunken/60 first:mt-0">
      <figcaption className="flex min-h-11 items-center justify-between gap-2 border-b border-line bg-surface/60 pl-4 pr-1 text-xs text-ink-3 pointer-coarse:min-h-12">
        <span className="font-medium text-ink-2">{languageLabel(lang)}</span>
        <span className="flex items-center">
          {open ? null : (
            <button type="button" onClick={download} aria-label="Download this code" title="Download" className="tap inline-flex size-10 items-center justify-center rounded-full hover:bg-surface-raised hover:text-ink pointer-coarse:size-11">
              <DownloadSimpleIcon size={14} weight="bold" aria-hidden />
            </button>
          )}
          <button type="button" onClick={copy} className="tap inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 hover:bg-surface-raised hover:text-ink pointer-coarse:min-h-11" aria-label={copied ? "Code copied" : "Copy code"}>
            {copied ? <CheckIcon size={14} weight="bold" className="text-verified" aria-hidden /> : <CopyIcon size={14} weight="bold" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </button>
        </span>
      </figcaption>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-label leading-relaxed text-ink [tab-size:2]" tabIndex={0} aria-label={`${languageLabel(lang)} code`}>
        <code>
          {tokens.map((t, i) =>
            t.k === "plain" ? (
              t.v
            ) : (
              <span key={i} className={TOKEN_CLASS[t.k]}>
                {t.v}
              </span>
            ),
          )}
        </code>
      </pre>
    </figure>
  );
}

const HEADING = ["", "text-[1.375rem] mt-7", "text-xl mt-6", "text-lg mt-5", "text-base mt-4", "text-base mt-4", "text-base mt-4"];

function BlockView({ block }: { block: Block }): ReactNode {
  switch (block.t) {
    case "p":
      return (
        <p className="my-3 first:mt-0 last:mb-0">
          <InlineView nodes={block.c} />
        </p>
      );
    case "h": {
      const tag = `h${Math.min(6, Math.max(2, block.level))}` as "h2";
      return createElement(tag, { className: `${HEADING[block.level]} mb-2 font-medium leading-snug tracking-[-0.02em] text-ink first:mt-0` }, <InlineView nodes={block.c} />);
    }
    case "code":
      return <CodeBlock lang={block.lang} code={block.v} open={block.open} />;
    case "math":
      return (
        <div className="my-4 overflow-x-auto">
          <MathView tex={block.v} display />
        </div>
      );
    case "hr":
      return <hr className="my-6 border-line" />;
    case "quote":
      return (
        <blockquote className="my-4 border-l-2 border-line-2 pl-4 text-ink-2">
          {block.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </blockquote>
      );
    case "list": {
      const items = block.items.map((item, i) => (
        <li key={i} className={`${item.checked === null ? "" : "flex list-none items-start gap-2"} ${block.tight ? "my-1" : "my-2"} pl-1 marker:text-ink-3`}>
          {item.checked !== null ? (
            item.checked ? (
              <CheckSquareIcon size={20} weight="fill" className="mt-0.5 shrink-0 text-accent" aria-label="Done" role="img" />
            ) : (
              <SquareIcon size={20} className="mt-0.5 shrink-0 text-ink-3" aria-label="Not done" role="img" />
            )
          ) : null}
          <div className="min-w-0 flex-1 [&>p]:my-0">
            {item.blocks.map((b, j) => (
              <BlockView key={j} block={b} />
            ))}
          </div>
        </li>
      ));
      return block.ordered ? (
        <ol start={block.start} className="my-3 list-decimal pl-6 first:mt-0 last:mb-0">
          {items}
        </ol>
      ) : (
        <ul className="my-3 list-disc pl-6 first:mt-0 last:mb-0">{items}</ul>
      );
    }
    case "table":
      return (
        <div className="my-4 overflow-x-auto rounded-md border border-line first:mt-0" tabIndex={0} role="region" aria-label="Table">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-surface-raised/70">
              <tr>
                {block.head.map((h, i) => (
                  <th key={i} scope="col" style={{ textAlign: block.align[i] ?? "left" }} className="whitespace-nowrap border-b border-line px-3.5 py-2.5 font-medium text-ink">
                    <InlineView nodes={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-line last:border-0 even:bg-surface-raised/30">
                  {row.map((cell, c) => (
                    <td key={c} style={{ textAlign: block.align[c] ?? "left" }} className="px-3.5 py-2.5 align-top text-ink-2 tabular">
                      <InlineView nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** One top-level block, redrawn only when its own source changes. */
const MemoBlock = memo(function MemoBlock({ block }: { block: Block; src: string }) {
  return <BlockView block={block} />;
}, (a, b) => a.src === b.src);

/** An answer's Markdown. `streaming` adds the caret after the last block. */
export function MarkdownView({ text, streaming = false }: { text: string; streaming?: boolean }) {
  // While an answer streams, rendering can fall a frame or two behind under load instead of re-reading every frame.
  const shown = useDeferredValue(text);
  const blocks = useMemo(() => parseMarkdown(shown), [shown]);
  return (
    <div className="chat-prose text-body leading-[1.7] text-ink [overflow-wrap:break-word]">
      {blocks.map((b, i) => (
        <MemoBlock key={i} block={b.block} src={b.src} />
      ))}
      {streaming ? <span className="chat-caret" aria-hidden /> : null}
    </div>
  );
}
