"use client";

import { PlusIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";
import type { SurveyDocument } from "@/core/survey/document";
import type { SurveyPoint } from "@/core/survey/parcel";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses } from "@/components/ui/field";

/** As many words as a plan holds (the document's own limit), so a save never fails on what was added here. */
export const MAX_TEXTS = 100;

/** A short id for something added on the sheet: unique enough within one plan, and within the document's id rule. */
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The plan with no symbol at a point: the field goes when the last one does, as it was before the first, so an earlier approval still matches. */
function withoutSymbol(d: SurveyDocument, point: string) {
  const rest = (d.symbols ?? []).filter((s) => s.point !== point);
  if (rest.length > 0) d.symbols = rest;
  else delete d.symbols;
}

/**
 * A surveyed point's panel (stage 255, ADR 0263): how it's drawn, and words written beside it. The point itself is the survey's and never
 * moves: "Drawn as" only says which of the code list's marks or symbols it's drawn as (an electric post the field codes didn't name),
 * and words are placed on paper beside it, or along the line to another point.
 */
export function PointEditor(props: {
  point: SurveyPoint;
  doc: SurveyDocument;
  points: readonly SurveyPoint[];
  update: (change: (d: SurveyDocument) => void, key?: string) => void;
  readOnly: boolean;
}) {
  const { point: p, doc, update } = props;
  const uid = useId();
  const [words, setWords] = useState("");
  const [along, setAlong] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const corner = doc.lots.some((l) => l.points.includes(p.id));
  const given = (doc.symbols ?? []).find((s) => s.point === p.id)?.code ?? "";
  const marks = doc.codes.filter((c) => c.kind === "mark" || c.kind === "symbol");
  const marksLocked = Boolean(doc.layers.BOUNDARY_MARKS?.locked);
  const textLocked = Boolean(doc.layers.TEXT?.locked);
  const textHidden = doc.layers.TEXT?.visible === false;
  const add = () => {
    const value = words.trim();
    if (!value) return setProblem("Type the words first.");
    let to: string | undefined;
    if (along.trim()) {
      const hits = props.points.filter((x) => x.pointId === along.trim());
      if (hits.length === 0) return setProblem(`There's no point ${along.trim()} in the survey.`);
      if (hits.length > 1) return setProblem(`More than one surveyed point is numbered ${along.trim()}, so the number alone can't say which.`);
      if (hits[0]!.id === p.id) return setProblem("Along the line to another point, not to this one.");
      to = hits[0]!.id;
    }
    if ((doc.texts ?? []).length >= MAX_TEXTS) return setProblem(`The plan holds ${MAX_TEXTS} sets of words at most: remove some to add more.`);
    setProblem(null);
    setWords("");
    setAlong("");
    update((d) => void (d.texts = [...(d.texts ?? []), { id: newId("t"), text: value, at: p.id, ...(to ? { along: to } : {}) }]));
  };
  return (
    <div className="mt-4 grid gap-4">
      {corner ? (
        <div className="grid gap-2">
          <p className="text-sm text-ink-3">A lot&apos;s corner is drawn as a corner.</p>
          {given ? (
            <button type="button" disabled={props.readOnly || marksLocked} onClick={() => update((d) => withoutSymbol(d, p.id))} className={buttonClasses("ghost", "sm", "w-fit")}>
              <TrashIcon size={16} weight="bold" aria-hidden /> Remove the {given} given to it
            </button>
          ) : null}
        </div>
      ) : (
        <label className="grid gap-1">
          <span className={LABEL_CLASSES}>Drawn as</span>
          <select
            value={given}
            disabled={props.readOnly || marksLocked}
            aria-describedby={`${uid}-drawn`}
            onChange={(e) =>
              update((d) => {
                const code = e.target.value;
                withoutSymbol(d, p.id);
                if (code) d.symbols = [...(d.symbols ?? []), { id: newId("s"), code, point: p.id }];
              })
            }
            className={inputClasses()}
          >
            <option value="">{p.code ? `As surveyed (${p.code})` : "As surveyed"}</option>
            {/* A code given before that the list no longer has is still shown, so the select says what's there. */}
            {given && !marks.some((c) => c.code === given) ? <option value={given}>{given}, not in the code list</option> : null}
            {marks.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}, {c.meaning}
              </option>
            ))}
          </select>
          <span id={`${uid}-drawn`} className="text-sm text-ink-3">
            {marksLocked ? "The Boundary marks layer is locked: unlock it on the Layers tab to change this." : "Only how it's drawn and listed in the Reference: the point stays where it was surveyed."}
          </span>
        </label>
      )}
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="grid gap-1">
          <span className={LABEL_CLASSES}>Words beside it</span>
          <input value={words} maxLength={80} disabled={props.readOnly || textLocked} onChange={(e) => setWords(e.target.value)} placeholder="Gate" aria-describedby={`${uid}-words`} className={inputClasses()} />
        </label>
        <div className="flex items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1">
            <span className={LABEL_CLASSES}>Along the line to point (optional)</span>
            <input value={along} maxLength={32} disabled={props.readOnly || textLocked} onChange={(e) => setAlong(e.target.value)} aria-describedby={`${uid}-words`} className={inputClasses("font-mono")} />
          </label>
          <button type="submit" disabled={props.readOnly || textLocked || !words.trim()} className={buttonClasses("secondary", "md")}>
            <PlusIcon size={16} weight="bold" aria-hidden /> Add
          </button>
        </div>
        <span id={`${uid}-words`} className="text-sm text-ink-3">
          {textLocked
            ? "The Text layer is locked: unlock it on the Layers tab to add words."
            : textHidden
              ? "The Text layer is hidden: words added here won't show until it's shown on the Layers tab."
              : "Written level beside the point, or along the line to another point when you give its number. Drag them on the sheet to move them."}
        </span>
      </form>
      {problem ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}
    </div>
  );
}

/** Words on the plan (stage 255): changed in place, kept while they say something, and removed after a second press. */
export function TextEditor(props: { id: string; doc: SurveyDocument; update: (change: (d: SurveyDocument) => void, key?: string) => void; readOnly: boolean; onRemoved: () => void }) {
  const t = (props.doc.texts ?? []).find((x) => x.id === props.id);
  const [value, setValue] = useState(t?.text ?? "");
  // What the plan said when the field last followed it: an undo or a redo that changes the words brings the field back in step.
  const [seen, setSeen] = useState(t?.text ?? "");
  const [confirming, setConfirming] = useState(false);
  if (t && t.text !== seen) {
    setSeen(t.text);
    if (t.text !== value.trim()) setValue(t.text);
  }
  if (!t) return null;
  const readOnly = props.readOnly || Boolean(props.doc.layers.TEXT?.locked);
  return (
    <div className="mt-4 grid gap-3">
      {props.doc.layers.TEXT?.locked && !props.readOnly ? <p className="text-sm text-ink-3">The Text layer is locked: unlock it on the Layers tab to change these words.</p> : null}
      <label className="grid gap-1">
        <span className={LABEL_CLASSES}>Words</span>
        <input
          value={value}
          maxLength={80}
          disabled={readOnly}
          onChange={(e) => {
            setValue(e.target.value);
            const v = e.target.value.trim();
            if (v) props.update((d) => void ((d.texts ?? []).find((x) => x.id === t.id)!.text = v), `text:${t.id}`);
          }}
          className={inputClasses()}
        />
      </label>
      {value.trim() === "" ? <p className="text-sm text-ink-3">Words can&apos;t be empty: the plan keeps the last ones. Remove them instead.</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">
          <span className={LABEL_CLASSES}>Size</span>
          <select
            value={String(t.size ?? 1)}
            disabled={readOnly}
            onChange={(e) =>
              props.update((d) => {
                const x = (d.texts ?? []).find((y) => y.id === t.id)!;
                const v = Number(e.target.value);
                if (v === 1) delete x.size;
                else x.size = v;
              })
            }
            className={inputClasses()}
          >
            <option value="0.8">Smaller</option>
            <option value="1">As usual</option>
            <option value="1.3">Larger</option>
            <option value="1.6">Largest</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className={LABEL_CLASSES}>Angle, degrees clockwise</span>
          <input
            type="number"
            step={1}
            min={-180}
            max={180}
            value={t.turn ?? ""}
            placeholder={t.along ? "Along its line" : "Level"}
            disabled={readOnly}
            onChange={(e) =>
              props.update((d) => {
                const x = (d.texts ?? []).find((y) => y.id === t.id)!;
                const v = e.target.value.trim() === "" ? NaN : Number(e.target.value);
                if (Number.isFinite(v)) x.turn = Math.max(-180, Math.min(180, v));
                else delete x.turn;
              }, `text-turn:${t.id}`)
            }
            className={inputClasses()}
          />
        </label>
      </div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-2">Remove these words from the plan?</span>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => {
              props.update((d) => {
                const rest = (d.texts ?? []).filter((x) => x.id !== t.id);
                if (rest.length > 0) d.texts = rest;
                else delete d.texts;
                delete d.labelOffsets[`text:${t.id}`];
              });
              props.onRemoved();
            }}
            className={buttonClasses("danger", "sm")}
          >
            <TrashIcon size={16} weight="bold" aria-hidden /> Remove
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={buttonClasses("ghost", "sm")}>
            Keep them
          </button>
        </div>
      ) : (
        <button type="button" disabled={readOnly} onClick={() => setConfirming(true)} className={buttonClasses("ghost", "sm", "w-fit")}>
          <TrashIcon size={16} weight="bold" aria-hidden /> Remove these words
        </button>
      )}
    </div>
  );
}

/**
 * A surveyed point found by its number (stage 255): a point the sheet doesn't draw (one surveyed without a mark's code) can't be tapped,
 * so it's chosen here, and its panel opens.
 */
export function FindPoint(props: { points: readonly SurveyPoint[]; onFound: (id: string) => void }) {
  const uid = useId();
  const [number, setNumber] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      className="grid gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const n = number.trim();
        const hits = props.points.filter((p) => p.pointId === n);
        if (hits.length === 0) return setProblem(`There's no point ${n} in the survey.`);
        if (hits.length > 1) return setProblem(`More than one surveyed point is numbered ${n}, so the number alone can't say which.`);
        setProblem(null);
        props.onFound(hits[0]!.id);
      }}
    >
      <label htmlFor={`${uid}-n`} className={LABEL_CLASSES}>
        Find a point by its number
      </label>
      <div className="flex gap-2">
        <input id={`${uid}-n`} value={number} maxLength={32} onChange={(e) => setNumber(e.target.value)} aria-describedby={`${uid}-hint`} className={inputClasses("min-w-0 flex-1 font-mono")} />
        <button type="submit" disabled={!number.trim()} className={buttonClasses("secondary", "md")}>
          Show
        </button>
      </div>
      <span id={`${uid}-hint`} className="text-sm text-ink-3">
        For a point the sheet doesn&apos;t draw: give it a mark, or words beside it.
      </span>
      {problem ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}
    </form>
  );
}
