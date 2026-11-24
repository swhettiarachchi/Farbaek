"use client";

import { RulerIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import type { SurveyDocument } from "@/core/survey/document";
import type { SurveyPoint } from "@/core/survey/parcel";
import { fmt } from "@/core/survey/units";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses } from "@/components/ui/field";
import { pointsFromNumbers } from "./selection-editor";

type Update = (change: (d: SurveyDocument) => void, key?: string) => void;

/** The most dimension lines a plan holds. */
const MAX_DIMENSIONS = 100;

/** One surveyed point by its number, or why not. */
function onePoint(text: string, points: readonly SurveyPoint[]): string | { problem: string } {
  const r = pointsFromNumbers(text, points);
  if ("problem" in r) return r;
  if (r.ids.length !== 1) return { problem: "Give one point number." };
  return r.ids[0]!;
}

/**
 * Adding a dimension line between two surveyed points (stage 265, ADR 0273): the distance is worked out from their coordinates, never
 * typed, and the line is drawn 6 mm of paper to the left looking from the first to the second, to be moved off with its offset.
 */
export function AddDimension(props: { doc: SurveyDocument; points: readonly SurveyPoint[]; update: Update; readOnly: boolean; onAdded: (id: string) => void }) {
  const dims = props.doc.dimensions ?? [];
  const num = (id: string) => props.points.find((p) => p.id === id)?.pointId;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const readOnly = props.readOnly || Boolean(props.doc.layers.DIMENSIONS?.locked);
  const add = () => {
    const a = onePoint(from, props.points);
    if (typeof a !== "string") return setProblem(a.problem);
    const b = onePoint(to, props.points);
    if (typeof b !== "string") return setProblem(b.problem);
    if (a === b) return setProblem("A dimension needs two different points.");
    if ((props.doc.dimensions ?? []).length >= MAX_DIMENSIONS) return setProblem(`The plan holds ${MAX_DIMENSIONS} dimension lines, its most.`);
    const id = `dim-${crypto.randomUUID().slice(0, 8)}`;
    setProblem(null);
    props.update((d) => void (d.dimensions = [...(d.dimensions ?? []), { id, from: a, to: b, offset: 6 }]));
    setFrom("");
    setTo("");
    props.onAdded(id);
  };
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <span className={LABEL_CLASSES}>Add a dimension line between two points</span>
      <div className="flex flex-wrap items-end gap-2">
        <input value={from} disabled={readOnly} onChange={(e) => setFrom(e.target.value)} placeholder="From" aria-label="Dimension from point" className={inputClasses("w-24 font-mono")} />
        <input value={to} disabled={readOnly} onChange={(e) => setTo(e.target.value)} placeholder="To" aria-label="Dimension to point" className={inputClasses("w-24 font-mono")} />
        <button type="submit" disabled={readOnly || !from.trim() || !to.trim()} className={buttonClasses("secondary", "md")}>
          <RulerIcon size={16} weight="bold" aria-hidden /> Add
        </button>
      </div>
      <span className="text-sm text-ink-3">{props.doc.layers.DIMENSIONS?.locked && !props.readOnly ? "The Dimensions layer is locked: unlock it on the Layers tab to add one." : "The distance is worked out from the coordinates."}</span>
      {dims.length > 0 ? (
        // Every dimension line, so one can be opened even when it isn't drawn (its point gone, or its layer hidden).
        <ul aria-label="Dimension lines" className="flex flex-wrap gap-2">
          {dims.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => props.onAdded(d.id)} className={buttonClasses("ghost", "sm")}>
                {num(d.from) && num(d.to) ? `${num(d.from)} to ${num(d.to)}` : "A point is missing"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {problem ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}
    </form>
  );
}

/** A selected dimension line (stage 265): its two points, how far off their line it's drawn, and removing it. */
export function DimensionEditor(props: { id: string; doc: SurveyDocument; points: readonly SurveyPoint[]; update: Update; readOnly: boolean; onRemoved: () => void }) {
  const dim = (props.doc.dimensions ?? []).find((x) => x.id === props.id);
  const num = (id: string) => props.points.find((p) => p.id === id)?.pointId ?? "?";
  const [from, setFrom] = useState(dim ? num(dim.from) : "");
  const [to, setTo] = useState(dim ? num(dim.to) : "");
  const [problem, setProblem] = useState<string | null>(null);
  // What's typed in the offset field, kept as typed: a lone "-" or an empty field isn't a number yet, and must not become 0.
  const [offsetText, setOffsetText] = useState(dim ? String(dim.offset) : "");
  if (!dim) return null;
  const readOnly = props.readOnly || Boolean(props.doc.layers.DIMENSIONS?.locked);
  const a = props.points.find((p) => p.id === dim.from);
  const b = props.points.find((p) => p.id === dim.to);
  const set = (change: (x: NonNullable<SurveyDocument["dimensions"]>[number]) => void, key?: string) => props.update((d) => change((d.dimensions ?? []).find((x) => x.id === dim.id)!), key);
  return (
    <div className="mt-4 grid gap-3">
      <p className="text-sm text-ink-2">{a && b ? `${fmt(Math.hypot(b.e - a.e, b.n - a.n), props.doc.settings.distanceDecimals)} m between ${num(dim.from)} and ${num(dim.to)}, from their coordinates.` : "One of its points is no longer in the survey."}</p>
      <form
        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const x = onePoint(from, props.points);
          if (typeof x !== "string") return setProblem(x.problem);
          const y = onePoint(to, props.points);
          if (typeof y !== "string") return setProblem(y.problem);
          if (x === y) return setProblem("A dimension needs two different points.");
          setProblem(null);
          set((d) => void ((d.from = x), (d.to = y)));
        }}
      >
        <label className="grid gap-1">
          <span className={LABEL_CLASSES}>From</span>
          <input value={from} disabled={readOnly} onChange={(e) => setFrom(e.target.value)} className={inputClasses("font-mono")} />
        </label>
        <label className="grid gap-1">
          <span className={LABEL_CLASSES}>To</span>
          <input value={to} disabled={readOnly} onChange={(e) => setTo(e.target.value)} className={inputClasses("font-mono")} />
        </label>
        <button type="submit" disabled={readOnly || (from === num(dim.from) && to === num(dim.to))} className={buttonClasses("secondary", "md")}>
          Apply
        </button>
      </form>
      <label className="grid gap-1">
        <span className={LABEL_CLASSES}>Drawn off the line, mm on paper</span>
        <input
          type="number"
          step={0.5}
          min={-40}
          max={40}
          value={offsetText}
          disabled={readOnly}
          onChange={(e) => {
            setOffsetText(e.target.value);
            const v = e.target.value.trim() === "" ? NaN : Number(e.target.value);
            if (Number.isFinite(v)) set((d) => void (d.offset = Math.max(-40, Math.min(40, v))), `dim-offset:${dim.id}`);
          }}
          className={inputClasses()}
        />
        <span className="text-sm text-ink-3">To the left looking from the first point to the second; a negative distance draws it on the right.</span>
      </label>
      {problem ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}
      <button
        type="button"
        disabled={readOnly}
        onClick={() => {
          props.update((d) => {
            const rest = (d.dimensions ?? []).filter((x) => x.id !== dim.id);
            if (rest.length > 0) d.dimensions = rest;
            else delete d.dimensions;
            delete d.labelOffsets[`dim:${dim.id}`];
          });
          props.onRemoved();
        }}
        className={buttonClasses("ghost", "sm", "w-fit")}
      >
        <TrashIcon size={16} weight="bold" aria-hidden /> Remove this dimension line
      </button>
    </div>
  );
}
