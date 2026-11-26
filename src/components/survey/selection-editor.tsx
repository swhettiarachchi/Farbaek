"use client";

import { CheckIcon, PencilSimpleIcon, TrashIcon, WarningCircleIcon } from "@/components/icons";
import { cornerBetween, type SquareCorner } from "@/core/survey/construct";
import { remapRuns, runIds, runOf } from "@/core/survey/lotcurves";
import { useState } from "react";
import { LAYER_NAMES } from "@/core/survey/assistant/describe";
import { FEATURE_LAYERS, type SurveyDocument } from "@/core/survey/document";
import type { SurveyPoint } from "@/core/survey/parcel";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses } from "@/components/ui/field";
import { ConstructPoint } from "./construct-point";
import { DimensionEditor } from "./dimension-editor";
import { PointEditor, TextEditor } from "./point-editor";

/** The sheet's own texts, edited as fields on the Sheet tab: tapping one opens them there. */
const SHEET_TEXTS = new Set(["title", "heading", "plan-number", "dates", "extent", "boundaries", "notes", "surveyor", "signature", "legend", "region", "scale"]);

/** As many lines as a plan holds, and points on one line (the document's own limits, so a save never fails on a drawn line). */
export const MAX_LINES = 300;
const MAX_LINE_POINTS = 500;

/** A line being drawn on the sheet: the surveyed points tapped or typed, in order, and what it is. */
export interface Drawing {
  points: string[];
  layer: (typeof FEATURE_LAYERS)[number];
  code: string;
  closed: boolean;
}

/**
 * The line with one more surveyed point. The same point twice in a row is one tap, not two; the first point again, after three or
 * more, closes the outline, as a surveyor closes a building.
 */
export function nextDrawing(d: Drawing, id: string): Drawing {
  if (d.points.at(-1) === id) return d;
  if (d.points.length >= 3 && d.points[0] === id) return { ...d, closed: true };
  if (d.points.length >= MAX_LINE_POINTS) return d;
  return { ...d, points: [...d.points, id] };
}

/** Why the line can't be finished, or null: a locked layer, or a plan that holds as many lines as it can. */
export function cannotFinish(d: Drawing, doc: SurveyDocument): string | null {
  if (doc.layers[d.layer]?.locked) return `${LAYER_NAMES[d.layer]} are locked: unlock them on the Layers tab, or draw this as something else.`;
  if (doc.features.length >= MAX_LINES) return `The plan holds ${MAX_LINES} lines at most: remove one to draw another.`;
  return null;
}

/** Where provenance says who drew an item, in words; null for the surveyor's own. */
const DRAWN_BY: Record<string, string> = { auto: "Farbaek's draft", ai_photo: "the sketch", ai_brief: "your description", ai_assist: "the assistant" };

/**
 * Points by the numbers the surveyor types, each one surveyed point: an edit never invents a point. Where two surveyed points share a
 * number, the one the item already uses is the one meant; otherwise the number alone can't say which, and it's refused with why.
 * Commas, semicolons or spaces between them: "1, 2, 3", "1; 2; 3" or "1 2 3".
 */
export function pointsFromNumbers(text: string, points: readonly SurveyPoint[], current: readonly string[] = []): { ids: string[] } | { problem: string } {
  const numbers = text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const ids: string[] = [];
  for (const n of numbers) {
    const hits = points.filter((p) => p.pointId === n);
    if (hits.length === 0) return { problem: `There's no point ${n} in the survey.` };
    const chosen = hits.length === 1 ? hits[0]! : hits.find((p) => current.includes(p.id));
    if (!chosen) return { problem: `More than one surveyed point is numbered ${n}, so the number alone can't say which. Renumber one in the survey files, or keep the corner that's there.` };
    ids.push(chosen.id);
  }
  return { ids };
}

/** Point numbers in order; a constructed square corner (ADR 0270) as the word corner, as the sketch reader writes it. */
const numbersOf = (ids: readonly string[], points: readonly SurveyPoint[], doc?: SurveyDocument) =>
  ids
    .map((id) => {
      const c = (doc?.constructed ?? []).find((x) => x.id === id);
      // A point worked out by hand by the name the surveyor gave it (ADR 0272).
      return c ? (c.kind === "square" ? "corner" : c.name) : (points.find((p) => p.id === id)?.pointId ?? "?");
    })
    .join(", ");

/**
 * A line's points from what the surveyor typed (stage 262, ADR 0270): surveyed numbers, with the word corner between two of them for a
 * square corner that wasn't surveyed. The corner is the plan's own one between those points, or squared to the longest surveyed line at
 * either of them; when nothing says which way it's square, that's said and nothing changes. A closed outline's last corner word lies on
 * its closing side.
 */
export function lineFromText(text: string, points: readonly SurveyPoint[], current: readonly string[], doc: SurveyDocument, closed: boolean): { ids: string[]; constructed: SquareCorner[] } | { problem: string } {
  const words = text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const isCorner = (w: string) => /^corner$/i.test(w);
  // A point worked out by hand (a meeting or an offset, ADR 0272) by its name: never a surveyed number, which the names can't take.
  const named = new Map((doc.constructed ?? []).flatMap((c) => (c.kind === "square" ? [] : [[c.name.toLowerCase(), c.id] as const])));
  // A surveyed number always means the surveyed point, even if a point worked out by hand was given that name before it was imported.
  const surveyedNumbers = new Set(points.map((p) => p.pointId.toLowerCase()));
  const byName = (w: string) => (surveyedNumbers.has(w.toLowerCase()) ? undefined : named.get(w.toLowerCase()));
  const r = pointsFromNumbers(words.filter((w) => !isCorner(w) && !byName(w)).join(" "), points, current);
  if ("problem" in r) return r;
  const name = (id: string) => points.find((p) => p.id === id)?.pointId ?? "?";
  const ids: string[] = [];
  const made: SquareCorner[] = [];
  const corner = (a: string, b: string): string | { problem: string } => {
    if (named.size > 0 && [...named.values()].some((x) => x === a || x === b)) return { problem: "A square corner goes between two surveyed points, not beside a point that wasn't surveyed." };
    const c = cornerBetween({ ...doc, constructed: [...(doc.constructed ?? []), ...made] }, points, a, b);
    if (!c) return { problem: `No surveyed line at ${name(a)} or ${name(b)} says which way the corner between them is square: survey the corner, or leave the word out.` };
    if (!made.some((x) => x.id === c.id) && !(doc.constructed ?? []).some((x) => x.id === c.id)) made.push(c);
    return c.id;
  };
  const between = "A square corner goes between two numbers: type corner between them.";
  let n = 0;
  let pending = false;
  for (const w of words) {
    if (isCorner(w)) {
      if (ids.length === 0) return { problem: between };
      pending = true;
      continue;
    }
    const pid = byName(w) ?? r.ids[n++]!;
    if (pending) {
      const c = corner(ids.at(-1)!, pid);
      if (typeof c !== "string") return c;
      ids.push(c);
      pending = false;
    }
    ids.push(pid);
  }
  if (pending) {
    if (!closed || ids.length < 3) return { problem: between };
    const c = corner(ids.at(-1)!, ids[0]!);
    if (typeof c !== "string") return c;
    ids.push(c);
  }
  return { ids, constructed: made };
}

/**
 * What can be changed about the thing tapped on the sheet (stage 253, ADR 0261), as a website builder's properties panel offers it: a
 * lot's name, note and corners; a line's kind, code, points and whether it closes; an adjoining land's words; the title block, on the
 * Sheet tab. Every change goes through the plan's own history, so undo, redo and saving a version work as for any edit, and every
 * field keeps to what the plan can hold, so a save never fails on what was typed here.
 *
 * Geometry is never moved: a corner or a line's point is always a surveyed point, chosen by its number, and the lot's area, the legs'
 * bearings and distances, and every check are worked out again from the coordinates at once. What the sketch or the assistant drew
 * becomes the surveyor's own once they change its geometry or its words, or press "It's right"; a name typed alone doesn't check it.
 */
export function SelectionEditor(props: {
  entity: string;
  doc: SurveyDocument;
  points: readonly SurveyPoint[];
  update: (change: (d: SurveyDocument) => void, key?: string) => void;
  readOnly: boolean;
  /** Opens the Sheet tab, where the title block's fields are. */
  onEditSheet: () => void;
  /** After something is removed: the selection goes. */
  onRemoved: () => void;
}) {
  const { entity, doc, points, update } = props;
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const id = entity.slice(entity.indexOf(":") + 1);
  const reviewed = (d: SurveyDocument, key: string) => {
    if (d.provenance[key]) d.provenance[key] = { ...d.provenance[key]!, reviewed: true };
  };

  if (SHEET_TEXTS.has(entity)) {
    return (
      <div className="mt-4 grid gap-2">
        <p className="text-sm text-ink-2">The title block&apos;s words are the plan&apos;s fields: change them on the Sheet tab, and the sheet follows.</p>
        <button type="button" onClick={props.onEditSheet} className={buttonClasses("secondary", "sm", "w-fit")}>
          <PencilSimpleIcon size={16} weight="bold" aria-hidden /> Edit the title block
        </button>
      </div>
    );
  }

  /** Who drew it and that it isn't checked yet, with the press that checks it. */
  const unchecked = (key: string, readOnly: boolean) => {
    const p = doc.provenance[key];
    if (!p || p.reviewed || !DRAWN_BY[p.source]) return null;
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-canvas-2 px-3 py-2 text-sm text-ink-2">
        <span className="min-w-0 flex-1">Drawn from {DRAWN_BY[p.source]}, not checked yet.</span>
        <button type="button" disabled={readOnly} onClick={() => update((d) => reviewed(d, key))} className={buttonClasses("secondary", "sm")}>
          <CheckIcon size={16} weight="bold" aria-hidden /> It&apos;s right
        </button>
      </div>
    );
  };

  const remove = (label: string, change: (d: SurveyDocument) => void, readOnly: boolean) =>
    confirming ? (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-2">Remove {label} from the plan?</span>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => {
            update(change);
            setConfirming(false);
            props.onRemoved();
          }}
          className={buttonClasses("danger", "sm")}
        >
          <TrashIcon size={16} weight="bold" aria-hidden /> Remove
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={buttonClasses("ghost", "sm")}>
          Keep it
        </button>
      </div>
    ) : (
      <button type="button" disabled={readOnly} onClick={() => setConfirming(true)} className={buttonClasses("ghost", "sm", "w-fit")}>
        <TrashIcon size={16} weight="bold" aria-hidden /> Remove {label}
      </button>
    );

  const said = problem ? (
    <p role="alert" className="flex items-start gap-2 text-sm text-failed">
      <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
      {problem}
    </p>
  ) : null;

  if (entity.startsWith("lot:") || entity.startsWith("lot-extent:")) {
    const lot = doc.lots.find((l) => l.id === id);
    if (!lot) return null;
    const key = `lot:${lot.id}`;
    const readOnly = props.readOnly || Boolean(doc.layers.BOUNDARY?.locked);
    const set = (field: "label" | "sup" | "note", value: string) => update((d) => void (d.lots.find((l) => l.id === lot.id)![field] = value), `lot-${field}:${lot.id}`);
    return (
      <div className="mt-4 grid gap-3">
        {unchecked(key, readOnly)}
        {doc.layers.BOUNDARY?.locked && !props.readOnly ? <p className="text-sm text-ink-3">The lots&apos; layer is locked: unlock it on the Layers tab to change this lot.</p> : null}
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
          <label className="grid gap-1">
            <span className={LABEL_CLASSES}>Lot</span>
            <input value={lot.label} maxLength={40} disabled={readOnly} onChange={(e) => set("label", e.target.value)} onBlur={(e) => e.target.value !== e.target.value.trim() && set("label", e.target.value.trim())} className={inputClasses()} />
          </label>
          <label className="grid gap-1">
            <span className={LABEL_CLASSES}>Raised</span>
            <input value={lot.sup} maxLength={6} disabled={readOnly} onChange={(e) => set("sup", e.target.value)} onBlur={(e) => e.target.value !== e.target.value.trim() && set("sup", e.target.value.trim())} className={inputClasses()} />
          </label>
        </div>
        <label className="grid gap-1">
          <span className={LABEL_CLASSES}>Note</span>
          <input value={lot.note} maxLength={80} disabled={readOnly} onChange={(e) => set("note", e.target.value)} onBlur={(e) => e.target.value !== e.target.value.trim() && set("note", e.target.value.trim())} className={inputClasses()} />
        </label>
        <Corners
          key={lot.points.join()}
          label="Corners, in order"
          hint="Surveyed point numbers. The area, the legs and the checks are worked out again from their coordinates."
          initial={numbersOf(lot.points, points)}
          readOnly={readOnly}
          onApply={(text) => {
            const r = pointsFromNumbers(text, points, lot.points);
            if ("problem" in r) return setProblem(r.problem);
            if (r.ids.length < 3) return setProblem("A lot needs at least three corners.");
            // Words beside a side the lot no longer has would lose their place: said, so they're moved or removed on purpose.
            const sides = new Set(r.ids.map((p, i) => [p, r.ids[(i + 1) % r.ids.length]!].sort().join("|")));
            const lost = doc.adjoining.filter((a) => a.lot === lot.id && !sides.has([a.from, a.to].sort().join("|")));
            // Its curves (ADR 0276) follow their points; one whose points are no longer corners in a row is taken off, and said.
            const curves = remapRuns(lot.points, r.ids, lot.arcs);
            const words = lost.length > 0 ? `${lost.map((a) => `"${a.text}"`).join(" and ")} ${lost.length === 1 ? "was" : "were"} beside a side the lot no longer has: move ${lost.length === 1 ? "it" : "them"} on the Lots step.` : "";
            const bent = curves.dropped > 0 ? `${curves.dropped === 1 ? "A curve" : `${curves.dropped} curves`} no longer ran through corners in a row, so ${curves.dropped === 1 ? "it was" : "they were"} taken off: give ${curves.dropped === 1 ? "it" : "them"} again under Curves.` : "";
            setProblem([words, bent].filter(Boolean).join(" ") || null);
            update((d) => {
              const l = d.lots.find((x) => x.id === lot.id)!;
              l.points = r.ids;
              if (curves.runs.length > 0) l.arcs = curves.runs;
              else delete l.arcs;
              reviewed(d, key);
            });
          }}
        />
        <Corners
          key={`arcs:${lot.points.join()}:${JSON.stringify(lot.arcs ?? [])}`}
          label="Curves"
          hint="Each curve's first point, the points on it and its last, as surveyed; a slash between curves (4 5 6 / 9 10 11). The area is taken inside each curve. Empty for straight sides."
          initial={(lot.arcs ?? []).map((a) => numbersOf(runIds(lot.points, a), points)).join(" / ")}
          readOnly={readOnly}
          onApply={(text) => {
            const runs: { from: number; to: number }[] = [];
            for (const part of text.split("/").map((s) => s.trim()).filter(Boolean)) {
              const r = pointsFromNumbers(part, points, lot.points);
              if ("problem" in r) return setProblem(r.problem);
              const run = runOf(lot.points, r.ids);
              if (!run) return setProblem(`${part}: a curve's points are three or more of the lot's corners in a row, in order.`);
              runs.push(run);
            }
            setProblem(null);
            update((d) => {
              const l = d.lots.find((x) => x.id === lot.id)!;
              if (runs.length > 0) l.arcs = runs;
              else delete l.arcs;
              reviewed(d, key);
            }, `lot-arcs:${lot.id}`);
          }}
        />
        {said}
        {remove(
          "this lot",
          (d) => {
            // Everything that pointed at it goes with it: its adjoining lands' words, its extract, and where its labels were moved to.
            d.lots = d.lots.filter((l) => l.id !== lot.id);
            d.adjoining = d.adjoining.filter((a) => a.lot !== lot.id);
            if (d.sheet.extractOf === lot.id) d.sheet.extractOf = "";
            delete d.labelOffsets[`lot:${lot.id}`];
            delete d.labelOffsets[`lot-extent:${lot.id}`];
            delete d.provenance[key];
          },
          readOnly,
        )}
      </div>
    );
  }

  if (entity.startsWith("feature:")) {
    const f = doc.features.find((x) => x.id === id);
    if (!f) return null;
    const key = `feature:${f.id}`;
    const readOnly = props.readOnly || Boolean(doc.layers[f.layer]?.locked);
    return (
      <div className="mt-4 grid gap-3">
        {unchecked(key, readOnly)}
        {doc.layers[f.layer]?.locked && !props.readOnly ? <p className="text-sm text-ink-3">Its layer is locked: unlock it on the Layers tab to change this line.</p> : null}
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
          <label className="grid gap-1">
            <span className={LABEL_CLASSES}>Drawn as</span>
            <select value={f.layer} disabled={readOnly} onChange={(e) => update((d) => void ((d.features.find((x) => x.id === f.id)!.layer = e.target.value as typeof f.layer), reviewed(d, key)))} className={inputClasses()}>
              {FEATURE_LAYERS.map((l) => (
                <option key={l} value={l}>
                  {LAYER_NAMES[l]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className={LABEL_CLASSES}>Code</span>
            <input value={f.code} maxLength={12} disabled={readOnly} onChange={(e) => update((d) => void (d.features.find((x) => x.id === f.id)!.code = e.target.value), `feature-code:${f.id}`)} onBlur={(e) => e.target.value !== e.target.value.trim() && update((d) => void (d.features.find((x) => x.id === f.id)!.code = e.target.value.trim()))} className={inputClasses()} />
          </label>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
          <input type="checkbox" checked={f.closed} disabled={readOnly || f.points.length < 3} onChange={(e) => update((d) => void ((d.features.find((x) => x.id === f.id)!.closed = e.target.checked), reviewed(d, key)))} className="size-5 shrink-0 accent-[var(--color-accent)]" />
          A closed outline, such as a building
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={f.dashed === true}
            disabled={readOnly}
            onChange={(e) =>
              update((d) => {
                const x = d.features.find((y) => y.id === f.id)!;
                if (e.target.checked) x.dashed = true;
                else delete x.dashed;
                reviewed(d, key);
              })
            }
            className="size-5 shrink-0 accent-[var(--color-accent)]"
          />
          Drawn dashed, such as a roof&apos;s edge
        </label>
        {f.closed ? null : (
          <label className="grid gap-1">
            <span className={LABEL_CLASSES}>Drawn on past its ends</span>
            <select
              value={f.runsOn ?? ""}
              disabled={readOnly}
              onChange={(e) =>
                update((d) => {
                  const x = d.features.find((y) => y.id === f.id)!;
                  const v = e.target.value;
                  if (v === "start" || v === "end" || v === "both") x.runsOn = v;
                  else delete x.runsOn;
                  reviewed(d, key);
                })
              }
              className={inputClasses()}
            >
              <option value="">No, it stops at its points</option>
              <option value="start">Past its first point</option>
              <option value="end">Past its last point</option>
              <option value="both">Past both ends</option>
            </select>
            <span className="text-sm text-ink-3">A short stub on paper, as a neighbour&apos;s wall carrying on is drawn: never a surveyed length.</span>
          </label>
        )}
        <Corners
          key={f.points.join()}
          label="Points, in order"
          hint="Surveyed point numbers, from one end to the other. Type corner between two numbers for a square corner that wasn't surveyed: it's worked out from the surveyed points."
          initial={numbersOf(f.points, points, doc)}
          readOnly={readOnly}
          onApply={(text) => {
            const r = lineFromText(text, points, f.points, doc, f.closed);
            if ("problem" in r) return setProblem(r.problem);
            if (r.ids.length < 2) return setProblem("A line needs at least two points.");
            setProblem(null);
            update((d) => {
              const x = d.features.find((y) => y.id === f.id)!;
              x.points = r.ids;
              if (r.constructed.length > 0) d.constructed = [...(d.constructed ?? []), ...r.constructed];
              // An outline needs three points; its curves were drawn through the old points, so they go with them.
              if (r.ids.length < 3) x.closed = false;
              delete x.arcs;
              reviewed(d, key);
            });
          }}
        />
        {said}
        <ConstructPoint key={f.points.join()} doc={doc} points={points} featureId={f.id} names={numbersOf(f.points, points, doc).split(", ")} readOnly={readOnly} update={(change) => update(change)} />
        {remove("this line", (d) => void ((d.features = d.features.filter((x) => x.id !== f.id)), delete d.labelOffsets[key], delete d.provenance[key]), readOnly)}
      </div>
    );
  }

  if (entity.startsWith("adjoining:")) {
    const a = doc.adjoining.find((x) => x.id === id);
    if (!a) return null;
    return <AdjoiningWords key={a.id} id={a.id} text={a.text} provenanceKey={`adjoining:${a.id}`} readOnly={props.readOnly} update={update} reviewed={reviewed} unchecked={unchecked(`adjoining:${a.id}`, props.readOnly)} remove={remove("these words", (d) => void ((d.adjoining = d.adjoining.filter((x) => x.id !== a.id)), delete d.labelOffsets[`adjoining:${a.id}`]), props.readOnly)} />;
  }

  // A surveyed point: how it's drawn, and words beside it (stage 255). Words on the plan: changed or removed.
  if (entity.startsWith("pt:") || entity.startsWith("mark:") || entity.startsWith("corner:")) {
    const p = points.find((x) => x.id === id);
    return p ? <PointEditor key={p.id} point={p} doc={doc} points={points} update={update} readOnly={props.readOnly} /> : null;
  }
  if (entity.startsWith("text:")) return <TextEditor key={id} id={id} doc={doc} update={update} readOnly={props.readOnly} onRemoved={props.onRemoved} />;
  // A dimension line (stage 265, ADR 0273).
  if (entity.startsWith("dim:")) return <DimensionEditor key={id} id={id} doc={doc} points={points} update={update} readOnly={props.readOnly} onRemoved={props.onRemoved} />;

  return null;
}

/**
 * The bar shown while a line is drawn (stage 253, ADR 0261): what it's drawn as and its code, the points so far, the numbers of points
 * that aren't drawn on the sheet typed in, and Finish, Undo point and Cancel. A locked layer or a full plan says why Finish is off; a
 * hidden layer says the line won't show until the layer does.
 */
export function DrawLineBar(props: {
  drawing: Drawing;
  setDrawing: (change: (d: Drawing) => Drawing) => void;
  doc: SurveyDocument;
  points: readonly SurveyPoint[];
  onFinish: () => void;
  onCancel: () => void;
}) {
  const { drawing, doc } = props;
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const blocked = cannotFinish(drawing, doc);
  const hiddenLayer = doc.layers[drawing.layer]?.visible === false;
  const add = () => {
    const r = pointsFromNumbers(typed, props.points, drawing.points);
    if ("problem" in r) return setProblem(r.problem);
    setProblem(null);
    setTyped("");
    props.setDrawing((d) => r.ids.reduce(nextDrawing, d));
  };
  return (
    <div role="group" aria-label="Drawing a line" className="grid gap-3 rounded-md bg-surface p-3 text-sm ring-1 ring-line">
      <p className="text-ink-2" aria-live="polite">
        {drawing.points.length === 0 ? "Tap the line's first surveyed point on the sheet, or type its number." : `Through ${numbersOf(drawing.points, props.points)}${drawing.closed ? ", closed" : ""}.`}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1">
          <span className={LABEL_CLASSES}>Drawn as</span>
          <select value={drawing.layer} onChange={(e) => props.setDrawing((d) => ({ ...d, layer: e.target.value as Drawing["layer"] }))} className={inputClasses("w-auto")}>
            {FEATURE_LAYERS.map((l) => (
              <option key={l} value={l}>
                {LAYER_NAMES[l]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className={LABEL_CLASSES}>Code</span>
          <input value={drawing.code} maxLength={12} onChange={(e) => props.setDrawing((d) => ({ ...d, code: e.target.value }))} className={inputClasses("w-24")} />
        </label>
        <form
          className="grid min-w-0 flex-1 basis-48 gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <span className={LABEL_CLASSES}>Add points by number</span>
          <div className="flex gap-2">
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="4, 5, 6" aria-label="Add points by number" className={inputClasses("min-w-0 flex-1 font-mono")} />
            <button type="submit" disabled={typed.trim() === ""} className={buttonClasses("secondary", "md")}>
              Add
            </button>
          </div>
        </form>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-ink">
        <input type="checkbox" checked={drawing.closed} disabled={drawing.points.length < 3} onChange={(e) => props.setDrawing((d) => ({ ...d, closed: e.target.checked }))} className="size-5 shrink-0 accent-[var(--color-accent)]" />
        A closed outline, such as a building (or tap the first point again)
      </label>
      {problem ? (
        <p role="alert" className="flex items-start gap-2 text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}
      {blocked ? <p className="text-ink-2">{blocked}</p> : hiddenLayer ? <p className="text-ink-3">{LAYER_NAMES[drawing.layer]} are hidden, so the line won&apos;t show on the sheet until they&apos;re shown on the Layers tab.</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={drawing.points.length < 2 || blocked !== null} onClick={props.onFinish} className={buttonClasses("primary", "sm")}>
          <CheckIcon size={16} weight="bold" aria-hidden /> Finish
        </button>
        <button type="button" disabled={drawing.points.length === 0} onClick={() => props.setDrawing((d) => (d.closed ? { ...d, closed: false } : { ...d, points: d.points.slice(0, -1) }))} className={buttonClasses("ghost", "sm")}>
          Undo point
        </button>
        <button type="button" onClick={props.onCancel} className={buttonClasses("ghost", "sm")}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** An adjoining land's words: typed freely, kept on the plan only while they say something, so a cleared field never empties them. */
function AdjoiningWords(p: {
  id: string;
  text: string;
  provenanceKey: string;
  readOnly: boolean;
  update: (change: (d: SurveyDocument) => void, key?: string) => void;
  reviewed: (d: SurveyDocument, key: string) => void;
  unchecked: React.ReactNode;
  remove: React.ReactNode;
}) {
  const [text, setText] = useState(p.text);
  const empty = text.trim() === "";
  return (
    <div className="mt-4 grid gap-3">
      {p.unchecked}
      <label className="grid gap-1">
        <span className={LABEL_CLASSES}>Words on the plan</span>
        <input
          value={text}
          maxLength={200}
          disabled={p.readOnly}
          onChange={(e) => {
            setText(e.target.value);
            const v = e.target.value.trim();
            if (v) p.update((d) => void ((d.adjoining.find((x) => x.id === p.id)!.text = v), p.reviewed(d, p.provenanceKey)), `adjoining:${p.id}`);
          }}
          className={inputClasses()}
        />
      </label>
      {empty ? <p className="text-sm text-ink-3">Words can&apos;t be empty: the plan keeps the last ones. Remove them instead if they shouldn&apos;t be there.</p> : null}
      {p.remove}
    </div>
  );
}

/** A list of point numbers, typed and applied in one go, so a half-typed number never redraws the plan. */
function Corners({ label, hint, initial, readOnly, onApply }: { label: string; hint: string; initial: string; readOnly: boolean; onApply: (text: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <form
      className="grid gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(text);
      }}
    >
      <span className={LABEL_CLASSES}>{label}</span>
      <div className="flex gap-2">
        <input value={text} disabled={readOnly} onChange={(e) => setText(e.target.value)} className={inputClasses("min-w-0 flex-1 font-mono")} aria-label={label} />
        <button type="submit" disabled={readOnly || text.trim() === initial.trim()} className={buttonClasses("secondary", "md")}>
          Apply
        </button>
      </div>
      <span className="text-sm text-ink-3">{hint}</span>
    </form>
  );
}
