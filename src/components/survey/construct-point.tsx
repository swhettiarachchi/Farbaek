"use client";

import { PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { CONSTRUCTED_MAX, pointFromSpec, refreshCorners, type PointSpec } from "@/core/survey/construct";
import type { SurveyDocument } from "@/core/survey/document";
import type { SurveyPoint } from "@/core/survey/parcel";
import { buttonClasses } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { LABEL_CLASSES, inputClasses } from "@/components/ui/field";

/**
 * Adding a point of a line that wasn't surveyed (stage 264, ADR 0272): where two surveyed lines meet, or a tape offset off one, typed
 * from the field book. It goes into the line after the point chosen, kept as a recipe from surveyed points, and the checks say it wasn't
 * surveyed. Nothing is placed by eye: every number is a surveyed point, every distance typed.
 */
export function ConstructPoint(props: { doc: SurveyDocument; points: readonly SurveyPoint[]; featureId: string; names: string[]; readOnly: boolean; update: (change: (d: SurveyDocument) => void) => void }) {
  const [kind, setKind] = useState<"meet" | "offset">("meet");
  const [name, setName] = useState("");
  const [a, setA] = useState(["", ""]);
  const [b, setB] = useState(["", ""]);
  const [from, setFrom] = useState("");
  const [toward, setToward] = useState("");
  const [along, setAlong] = useState("");
  const [out, setOut] = useState("");
  const [side, setSide] = useState<"left" | "right">("left");
  const [after, setAfter] = useState(Math.max(0, props.names.length - 1));
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const add = () => {
    setDone(null);
    const metres = (s: string) => (s.trim() === "" ? NaN : Number(s.trim().replace(",", ".")));
    const spec: PointSpec =
      kind === "meet"
        ? { kind, name, a: [a[0]!, a[1]!], b: [b[0]!, b[1]!] }
        : // The side comes from the select alone: a distance typed with a minus sign is the same distance.
          { kind, name, from, toward, along: metres(along), out: out.trim() === "" ? 0 : Math.abs(metres(out)) * (side === "left" ? 1 : -1) };
    const r = pointFromSpec(spec, props.points, props.doc, crypto.randomUUID());
    if ("problem" in r) return setProblem(r.problem);
    if ((props.doc.constructed ?? []).length >= CONSTRUCTED_MAX) return setProblem(`The plan holds ${CONSTRUCTED_MAX} points that weren't surveyed, its most.`);
    const line = props.doc.features.find((x) => x.id === props.featureId);
    if (!line) return;
    if (line.points.length >= 500) return setProblem("The line holds 500 points, its most.");
    const change = (d: SurveyDocument) => {
      d.constructed = [...(d.constructed ?? []), r.point];
      const f = d.features.find((x) => x.id === props.featureId);
      if (!f) return;
      f.points.splice(Math.min(after + 1, f.points.length), 0, r.point.id);
      delete f.arcs;
      const key = `feature:${f.id}`;
      if (d.provenance[key]) d.provenance[key] = { ...d.provenance[key]!, reviewed: true };
    };
    // Beside a square corner, which must stand between two surveyed points, the corner would be taken out: refused, never silent.
    const tried = structuredClone(props.doc);
    change(tried);
    if (refreshCorners(tried, props.points).removed.length > 0) return setProblem("That place is beside a square corner, which must stand between two surveyed points: put the point after another one.");
    setProblem(null);
    props.update(change);
    setDone(`${r.point.name} is in the line after ${props.names[after] ?? "its first point"}, worked out from surveyed points.`);
    setName("");
  };

  const num = (value: string, set: (v: string) => void, label: string) => (
    <label className="grid gap-1">
      <span className={LABEL_CLASSES}>{label}</span>
      <input value={value} disabled={props.readOnly} onChange={(e) => set(e.target.value)} inputMode="text" className={inputClasses("font-mono")} />
    </label>
  );

  return (
    <Disclosure summary="Add a point that wasn't surveyed" hint="Where two surveyed lines meet, or a tape offset from the field book.">
      <div className="grid gap-3">
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
          <label className="grid gap-1">
            <span className={LABEL_CLASSES}>Worked out as</span>
            <select value={kind} disabled={props.readOnly} onChange={(e) => setKind(e.target.value === "offset" ? "offset" : "meet")} className={inputClasses()}>
              <option value="meet">Where two lines meet</option>
              <option value="offset">By tape off a line</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className={LABEL_CLASSES}>Name</span>
            <input value={name} maxLength={12} disabled={props.readOnly} onChange={(e) => setName(e.target.value)} placeholder="3a" className={inputClasses("font-mono")} />
          </label>
        </div>
        {kind === "meet" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {num(a[0]!, (v) => setA([v, a[1]!]), "First line, from")}
              {num(a[1]!, (v) => setA([a[0]!, v]), "to")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {num(b[0]!, (v) => setB([v, b[1]!]), "Second line, from")}
              {num(b[1]!, (v) => setB([b[0]!, v]), "to")}
            </div>
            <span className="text-sm text-ink-3">Each line runs on as far as it needs to meet the other.</span>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {num(from, setFrom, "From point")}
              {num(toward, setToward, "Towards point")}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem] gap-2">
              {num(along, setAlong, "Along it, m")}
              {num(out, setOut, "Then square off it, m")}
              <label className="grid gap-1">
                <span className={LABEL_CLASSES}>To its</span>
                <select value={side} disabled={props.readOnly} onChange={(e) => setSide(e.target.value === "right" ? "right" : "left")} className={inputClasses()}>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </label>
            </div>
            <span className="text-sm text-ink-3">As booked: so far along the line, then square off it, looking from the first point to the second.</span>
          </>
        )}
        <label className="grid gap-1">
          <span className={LABEL_CLASSES}>Put it in the line after</span>
          <select value={after} disabled={props.readOnly} onChange={(e) => setAfter(Number(e.target.value))} className={inputClasses()}>
            {props.names.map((n, i) => (
              <option key={`${n}-${i}`} value={i}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={props.readOnly} onClick={add} className={buttonClasses("secondary", "md", "w-fit")}>
          <PlusIcon size={16} weight="bold" aria-hidden /> Add the point
        </button>
        {problem ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
            {problem}
          </p>
        ) : done ? (
          <p role="status" className="text-sm text-ink-2">
            {done}
          </p>
        ) : null}
      </div>
    </Disclosure>
  );
}
