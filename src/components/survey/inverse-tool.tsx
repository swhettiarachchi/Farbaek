"use client";

import { useMemo, useState } from "react";
import { formatDms, toDms } from "@/core/survey/angles";
import { inverse } from "@/core/survey/cogo";
import type { SurveyPoint } from "@/core/survey/parcel";
import { fmt } from "@/core/survey/units";
import { LABEL_CLASSES, inputClasses } from "@/components/ui/field";

/** The inverse between two points, by their numbers: a reviewer's check, from the tested engine. */
export function InverseTool({ points }: { points: SurveyPoint[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const byNumber = useMemo(() => new Map(points.map((p) => [p.pointId.trim(), p])), [points]);
  const a = byNumber.get(from.trim());
  const b = byNumber.get(to.trim());
  const r = a && b ? inverse(a, b) : null;
  const unknown = [from, to].map((x) => x.trim()).filter((x) => x && !byNumber.has(x));
  const field = (label: string, value: string, set: (v: string) => void, id: string) => (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={LABEL_CLASSES}>
        {label}
      </label>
      <input id={id} value={value} onChange={(e) => set(e.target.value.slice(0, 32))} inputMode="text" autoComplete="off" list="survey-point-numbers" className={inputClasses()} />
    </div>
  );
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        {field("From point", from, setFrom, "inverse-from")}
        {field("To point", to, setTo, "inverse-to")}
      </div>
      <datalist id="survey-point-numbers">
        {points.slice(0, 2000).map((p) => (
          <option key={p.id} value={p.pointId} />
        ))}
      </datalist>
      {unknown.length > 0 ? <p className="text-sm text-ink-2">Not in this project: {unknown.join(", ")}.</p> : null}
      {r ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:max-w-md">
          <dt className="text-ink-3">Bearing</dt>
          <dd className="font-mono tabular text-ink">{r.bearing === null ? "None: the points coincide" : formatDms(toDms(r.bearing, 0))}</dd>
          <dt className="text-ink-3">Distance</dt>
          <dd className="font-mono tabular text-ink">{fmt(r.distanceM, 3)} m</dd>
          <dt className="text-ink-3">Change in easting</dt>
          <dd className="font-mono tabular text-ink">{fmt(r.dE, 3)} m</dd>
          <dt className="text-ink-3">Change in northing</dt>
          <dd className="font-mono tabular text-ink">{fmt(r.dN, 3)} m</dd>
          {r.dZ !== null ? (
            <>
              <dt className="text-ink-3">Change in height</dt>
              <dd className="font-mono tabular text-ink">{fmt(r.dZ, 3)} m</dd>
            </>
          ) : null}
        </dl>
      ) : null}
      <p className="text-sm text-ink-3">Whole-circle bearing from grid north and horizontal grid distance, from the points as imported. No scale factor is applied.</p>
    </div>
  );
}
