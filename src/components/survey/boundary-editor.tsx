"use client";

import { CheckCircleIcon, PlusIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatDms, toDms } from "@/core/survey/angles";
import { FEATURE_LAYERS, type DrawingFeature, type SurveyDocument } from "@/core/survey/document";
import { computeParcel, type SurveyPoint } from "@/core/survey/parcel";
import { fmt } from "@/core/survey/sheet/compose";
import { fromSquareMetres, formatArp, toArp } from "@/core/survey/units";
import { saveSurveyDrawingAction } from "@/app/app/survey/actions";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses } from "@/components/ui/field";

const FEATURE_LABELS: Record<(typeof FEATURE_LAYERS)[number], string> = { BUILDINGS: "Building", WALLS: "Wall", FENCES: "Fence", DRAINS: "Drain", ROADS: "Road edge", UTILITIES: "Utility" };

/** Reads "1 2 3 4" or "1, 2, 3, 4" into point ids, keeping unknown numbers to report. */
function readOrder(text: string, byNumber: Map<string, SurveyPoint>): { ids: string[]; unknown: string[] } {
  const tokens = text.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const t of tokens) {
    const p = byNumber.get(t);
    if (p) ids.push(p.id);
    else unknown.push(t);
  }
  return { ids, unknown };
}

export function BoundaryEditor({ projectId, baseVersion, document, points, readOnly }: { projectId: string; baseVersion: number; document: SurveyDocument; points: SurveyPoint[]; readOnly: string | null }) {
  const router = useRouter();
  const byNumber = useMemo(() => new Map(points.map((p) => [p.pointId, p])), [points]);
  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  const [order, setOrder] = useState(document.boundary.map((id) => byId.get(id)?.pointId ?? "?").join(" "));
  const [features, setFeatures] = useState<DrawingFeature[]>(document.features);
  const [draft, setDraft] = useState<{ layer: DrawingFeature["layer"]; code: string; closed: boolean; points: string }>({ layer: "BUILDINGS", code: "", closed: true, points: "" });
  const [message, setMessage] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const read = readOrder(order, byNumber);
  const result = read.ids.length >= 2 ? computeParcel(points, read.ids) : null;
  const parcel = result && result.ok ? result.parcel : null;
  const changed = read.ids.join(",") !== document.boundary.join(",") || JSON.stringify(features) !== JSON.stringify(document.features);

  const addFeature = () => {
    const r = readOrder(draft.points, byNumber);
    if (r.unknown.length > 0) {
      setMessage({ tone: "error", text: `These point numbers aren't in the project: ${r.unknown.join(", ")}.` });
      return;
    }
    if (r.ids.length < 2) {
      setMessage({ tone: "error", text: "A feature needs at least two points." });
      return;
    }
    setFeatures((f) => [...f, { id: `f${Date.now().toString(36)}`, layer: draft.layer, code: draft.code.trim().slice(0, 12), closed: draft.closed && r.ids.length >= 3, points: r.ids }]);
    setDraft((d) => ({ ...d, code: "", points: "" }));
    setMessage(null);
  };

  const save = () =>
    start(async () => {
      if (read.unknown.length > 0) {
        setMessage({ tone: "error", text: `These point numbers aren't in the project: ${read.unknown.join(", ")}.` });
        return;
      }
      const r = await saveSurveyDrawingAction({ projectId, baseVersion, document: { ...document, boundary: read.ids, features }, note: "Boundary and features" });
      if (r.status === "done") {
        setMessage({ tone: "done", text: r.message });
        router.refresh();
      } else if (r.status === "error") setMessage({ tone: "error", text: r.message });
    });

  return (
    <div className="grid gap-6">
      <label className="grid gap-1.5">
        <span className={LABEL_CLASSES}>Boundary points, in order round the parcel</span>
        <input value={order} onChange={(e) => setOrder(e.target.value)} disabled={Boolean(readOnly)} inputMode="text" placeholder="1 2 3 4 5" className={inputClasses("font-mono")} />
        <span className="text-sm text-ink-3">The boundary closes from the last point back to the first by itself. Farbaek never reorders or closes it for you.</span>
      </label>
      {read.unknown.length > 0 ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          Not in this project: {read.unknown.join(", ")}.
        </p>
      ) : null}

      {parcel ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="overflow-x-auto rounded-md ring-1 ring-line">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <caption className="sr-only">Boundary legs, computed from the points&apos; coordinates</caption>
              <thead className="bg-canvas-2 text-ink-2">
                <tr>
                  <th scope="col" className="p-2 font-medium">From</th>
                  <th scope="col" className="p-2 font-medium">To</th>
                  <th scope="col" className="p-2 text-right font-medium">Bearing</th>
                  <th scope="col" className="p-2 text-right font-medium">Distance (m)</th>
                </tr>
              </thead>
              <tbody>
                {parcel.legs.map((l, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="p-2">{l.from.pointId}</td>
                    <td className="p-2">{l.to.pointId}</td>
                    <td className="p-2 text-right font-mono tabular">{l.bearing === null ? "None" : formatDms(toDms(l.bearing, document.settings.secondDecimals))}</td>
                    <td className="p-2 text-right font-mono tabular">{fmt(l.distance, document.settings.distanceDecimals)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid content-start gap-3 rounded-md bg-surface p-4 ring-1 ring-line">
            {parcel.vertices.length >= 3 && parcel.crossings.length === 0 ? (
              <>
                <p className="text-2xl font-medium tracking-[-0.02em] tabular">{formatArp(toArp(parcel.areaM2, document.settings.perchDecimals))}</p>
                <p className="text-sm text-ink-2 tabular">
                  {fmt(fromSquareMetres(parcel.areaM2, "ha"), 4)} ha, {fmt(parcel.areaM2, 2)} m². Perimeter {fmt(parcel.perimeterM, 2)} m.
                </p>
                <p className="text-sm text-ink-3">Grid area by the coordinate method.</p>
              </>
            ) : null}
            {parcel.crossings.length > 0 ? <Problem text="The boundary crosses itself: check the order of the points." /> : null}
            {parcel.repeatedPoints.length > 0 ? <Problem text={`Point ${parcel.repeatedPoints.join(", ")} is used more than once.`} /> : null}
            {parcel.zeroLegs.length > 0 ? <Problem text="Two boundary points sit on the same spot." /> : null}
            {parcel.vertices.length < 3 ? <Problem text="Add at least three points." /> : null}
            {parcel.vertices.length >= 3 && parcel.crossings.length === 0 && parcel.repeatedPoints.length === 0 && parcel.zeroLegs.length === 0 ? (
              <p className="flex items-start gap-2 text-sm text-ink">
                <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
                A simple closed boundary with {parcel.legs.length} legs.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3">
        <p className="font-medium text-ink">Features</p>
        <p className="text-sm text-ink-2">Buildings, walls, fences and drains through points already imported. They appear on the plan on their own layers.</p>
        {features.length > 0 ? (
          <ul className="grid gap-2">
            {features.map((f, i) => (
              <li key={f.id} className="flex min-h-11 items-center gap-3 rounded-sm bg-surface px-3 ring-1 ring-line">
                <span className="text-sm font-medium text-ink">{FEATURE_LABELS[f.layer]}</span>
                {f.code ? <span className="font-mono text-sm text-ink-2">{f.code}</span> : null}
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink-3">{f.points.map((id) => byId.get(id)?.pointId ?? "?").join(" ")}</span>
                <button type="button" aria-label={`Remove this ${FEATURE_LABELS[f.layer].toLowerCase()}`} disabled={Boolean(readOnly)} onClick={() => setFeatures((all) => all.filter((_, j) => j !== i))} className={buttonClasses("ghost", "sm", "size-11 px-0")}>
                  <TrashIcon size={16} weight="bold" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="grid gap-3 rounded-md bg-canvas-2 p-3 ring-1 ring-line sm:grid-cols-[10rem_6rem_minmax(0,1fr)]">
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>Kind</span>
            <select value={draft.layer} disabled={Boolean(readOnly)} onChange={(e) => setDraft((d) => ({ ...d, layer: e.target.value as DrawingFeature["layer"], closed: e.target.value === "BUILDINGS" }))} className={inputClasses()}>
              {FEATURE_LAYERS.map((l) => (
                <option key={l} value={l}>
                  {FEATURE_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>Code</span>
            <input value={draft.code} maxLength={12} disabled={Boolean(readOnly)} onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} placeholder="MW" className={inputClasses("font-mono")} />
          </label>
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>Points, in order</span>
            <input value={draft.points} disabled={Boolean(readOnly)} onChange={(e) => setDraft((d) => ({ ...d, points: e.target.value }))} placeholder="B1 B2 B3 B4" className={inputClasses("font-mono")} />
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm text-ink sm:col-span-2">
            <input type="checkbox" checked={draft.closed} disabled={Boolean(readOnly)} onChange={(e) => setDraft((d) => ({ ...d, closed: e.target.checked }))} className="size-5 accent-[var(--color-accent)]" />
            Closed outline
          </label>
          <button type="button" onClick={addFeature} disabled={Boolean(readOnly)} className={buttonClasses("secondary", "sm", "self-end")}>
            <PlusIcon size={16} weight="bold" aria-hidden />
            Add feature
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={Boolean(readOnly) || pending || !changed} className={buttonClasses("primary", "md")}>
          {pending ? "Saving…" : "Save boundary and features"}
        </button>
        {readOnly ? <span className="text-sm text-ink-3">{readOnly}</span> : !changed ? <span className="text-sm text-ink-3">No changes to save.</span> : null}
      </div>
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 text-sm ${message.tone === "error" ? "text-failed" : "text-ink"}`}>
          {message.tone === "error" ? <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> : <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />}
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 text-sm text-ink">
      <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
      {text}
    </p>
  );
}
