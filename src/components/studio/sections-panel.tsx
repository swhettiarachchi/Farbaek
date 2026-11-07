"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookOpenTextIcon,
  CopyIcon,
  DotsSixVerticalIcon,
  HashIcon,
  ImagesIcon,
  LockSimpleIcon,
  MegaphoneSimpleIcon,
  PlusIcon,
  QuestionIcon,
  QuotesIcon,
  SlideshowIcon,
  SquareSplitHorizontalIcon,
  SquaresFourIcon,
  TextAaIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { SNIPPETS, type SnippetId } from "@/core/studio/snippets";
import type { SectionInfo, VisualEdit } from "@/core/studio/visual-edit";

const SNIPPET_ICONS: Record<SnippetId, Icon> = {
  split: SquareSplitHorizontalIcon,
  stats: HashIcon,
  cards: SquaresFourIcon,
  quote: QuotesIcon,
  faq: QuestionIcon,
  cta: MegaphoneSimpleIcon,
  photos: ImagesIcon,
  chapters: BookOpenTextIcon,
  carousel: SlideshowIcon,
  marquee: TextAaIcon,
};

const iconButton =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors duration-150 hover:bg-surface-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const actionButton =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-ink-2 transition-colors duration-150 hover:bg-surface-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * The page's sections (ADR 0159): drag one by its handle, or use the arrows,
 * to change the order; duplicate or delete it; add a section from Farbaek's
 * gallery after the chosen one. Each action becomes a draft edit the person
 * reviews before saving.
 */
export function SectionsPanel({
  items,
  selected,
  container,
  kitPro,
  onSelect,
  onEdit,
}: {
  items: readonly SectionInfo[];
  /** The chosen section's number, if one is chosen. */
  selected: number | null;
  /** The element new sections go at the end of when none is chosen (main or the body). */
  container: number | null;
  kitPro: boolean;
  onSelect(n: number): void;
  onEdit(n: number, edit: VisualEdit): void;
}) {
  const rows = useRef(new Map<number, HTMLLIElement>());
  const [drag, setDrag] = useState<{ n: number; before: number | null | undefined } | null>(null);
  const [adding, setAdding] = useState(false);

  // Where a dragged section would land: before the row whose middle is below the pointer, or at the end.
  function targetAt(y: number): number | null {
    for (const item of items) {
      const r = rows.current.get(item.n)?.getBoundingClientRect();
      if (r && y < r.top + r.height / 2) return item.n;
    }
    return null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>, n: number) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ n, before: undefined });
  }
  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    setDrag({ n: drag.n, before: targetAt(e.clientY) });
  }
  function onPointerUp() {
    const d = drag;
    setDrag(null);
    if (!d || d.before === undefined || d.before === d.n) return;
    const i = items.findIndex((s) => s.n === d.n);
    const j = d.before === null ? items.length : items.findIndex((s) => s.n === d.before);
    if (j === i || j === i + 1) return;
    onEdit(d.n, { kind: "move", before: d.before });
  }
  const move = (i: number, by: -1 | 1) => {
    const item = items[i]!;
    if (by === -1) onEdit(item.n, { kind: "move", before: items[i - 1]!.n });
    else onEdit(item.n, { kind: "move", before: items[i + 2]?.n ?? null });
  };

  const anchor = selected ?? items.at(-1)?.n ?? container;

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <p className="text-[0.9375rem] font-medium">Sections on this page</p>
        <p className="text-xs leading-relaxed text-ink-3">Drag a section by its handle, here or in the preview, to change the order. Alt+click in the preview picks a whole section.</p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-sm border border-dashed border-line-strong/40 p-4 text-sm text-ink-3">This page has no sections to arrange. Add one from the gallery below.</p>
      ) : (
        <ol className="grid gap-1" aria-label="Sections, in order">
          {items.map((item, i) => {
            const isDragged = drag?.n === item.n;
            const dropHere = drag && drag.before === item.n && drag.n !== item.n;
            return (
              <li
                key={item.n}
                ref={(node) => {
                  if (node) rows.current.set(item.n, node);
                  else rows.current.delete(item.n);
                }}
                className={`relative grid rounded-sm border bg-surface transition-[border-color,background-color,opacity] duration-150 ${selected === item.n ? "border-accent bg-accent/[0.05]" : "border-line"} ${isDragged ? "opacity-60" : ""}`}
              >
                {dropHere ? <span aria-hidden className="absolute inset-x-2 -top-1 h-0.5 rounded-full bg-accent" /> : null}
                <div className="flex items-center gap-1 pr-2">
                <button
                  type="button"
                  aria-label={`Drag ${item.label} to move it`}
                  onPointerDown={(e) => onPointerDown(e, item.n)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={() => setDrag(null)}
                  className={`${iconButton} cursor-grab touch-none active:cursor-grabbing`}
                >
                  <DotsSixVerticalIcon size={18} weight="bold" aria-hidden />
                </button>
                <button type="button" onClick={() => onSelect(item.n)} aria-current={selected === item.n ? "true" : undefined} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm">
                  <span className="line-clamp-2 min-w-0">{item.label}</span>
                </button>
                </div>
                {selected === item.n ? (
                  <div className="flex flex-wrap gap-1 border-t border-line/70 px-1 py-1" role="group" aria-label={`Change ${item.label}`}>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={actionButton}>
                      <ArrowUpIcon size={15} aria-hidden /> Up
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className={actionButton}>
                      <ArrowDownIcon size={15} aria-hidden /> Down
                    </button>
                    <button type="button" onClick={() => onEdit(item.n, { kind: "duplicate" })} className={actionButton}>
                      <CopyIcon size={15} aria-hidden /> Duplicate
                    </button>
                    <button type="button" onClick={() => onEdit(item.n, { kind: "remove" })} disabled={items.length <= 1} className={`${actionButton} hover:text-failed`}>
                      <TrashIcon size={15} aria-hidden /> Delete
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
          {drag && drag.before === null ? <li aria-hidden className="h-0.5 rounded-full bg-accent" /> : null}
        </ol>
      )}

      {adding ? (
        <div className="grid gap-3 rounded-md border border-line bg-surface-raised p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Add a section {selected !== null ? "after the chosen one" : "at the end"}</p>
            <button type="button" aria-label="Close the gallery" onClick={() => setAdding(false)} className={iconButton}>
              <XIcon size={16} aria-hidden />
            </button>
          </div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {(Object.entries(SNIPPETS) as [SnippetId, (typeof SNIPPETS)[SnippetId]][]).map(([id, s]) => {
              const SnippetIcon = SNIPPET_ICONS[id];
              const locked = s.pro && !kitPro;
              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled={locked || anchor === null}
                    onClick={() => {
                      if (anchor === null) return;
                      onEdit(anchor, { kind: "insert", snippet: id });
                      setAdding(false);
                    }}
                    className="grid h-full w-full gap-1.5 rounded-sm border border-line bg-surface p-3 text-left transition-[border-color,transform] duration-150 hover:border-accent/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-line"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <SnippetIcon size={18} className="shrink-0 text-accent" aria-hidden />
                      {s.label}
                      {s.pro ? (
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs font-normal text-ink-3">
                          {locked ? <LockSimpleIcon size={11} aria-hidden /> : null}
                          Pro
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs leading-relaxed text-ink-3">{locked ? `${s.description} Studio kit Pro is part of the paid plans.` : s.description}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={anchor === null}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium transition-colors duration-150 hover:border-accent/60 disabled:opacity-50"
          >
            <PlusIcon size={16} aria-hidden /> Add a section
          </button>
        </div>
      )}
    </div>
  );
}
