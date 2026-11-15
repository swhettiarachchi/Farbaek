"use client";

import { CheckCircleIcon, ListPlusIcon, PlusIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FEATURE_LAYERS, legIndex, lotName, pruneProvenance, type Adjoining, type DrawingFeature, type Lot, type Provenance, type Road, type SurveyDocument } from "@/core/survey/document";
import { suggestFeatures } from "@/core/survey/fieldToFinish";
import { roadWidthText, arpClassic, hectares } from "@/core/survey/formats";
import { computeLots } from "@/core/survey/lots";
import type { SurveyPoint } from "@/core/survey/parcel";
import { roadWidth } from "@/core/survey/roads";
import { fmt, toArp } from "@/core/survey/units";
import { saveSurveyDrawingAction } from "@/app/app/survey/actions";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";

const FEATURE_LABELS: Record<(typeof FEATURE_LAYERS)[number], string> = { BUILDINGS: "Building", WALLS: "Wall", FENCES: "Fence", DRAINS: "Drain", ROADS: "Road edge", UTILITIES: "Utility" };

/** Reads "1 2 3 4" or "1, 2, 3, 4" into point ids, keeping unknown numbers to report. */
function readOrder(text: string, byNumber: Map<string, SurveyPoint>): { ids: string[]; unknown: string[] } {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const t of text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)) {
    const p = byNumber.get(t);
    if (p) ids.push(p.id);
    else unknown.push(t);
  }
  return { ids, unknown };
}

/** A lot's first leg, as its two corners, for a new label or a label moved to another lot. */
const firstLeg = (lot: Lot | undefined) => ({ from: lot?.points[0] ?? "", to: lot?.points[1] ?? lot?.points[0] ?? "" });

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

interface LotRow {
  id: string;
  label: string;
  sup: string;
  note: string;
  order: string;
}
interface RoadRow {
  id: string;
  name: string;
  a: string;
  b: string;
  width: Road["width"];
  start: string;
  end: string;
}

function Provenanced({ provenance, k, onAccept, readOnly }: { provenance: Provenance; k: string; onAccept: () => void; readOnly: boolean }) {
  const p = provenance[k];
  if (!p || p.source === "engine") return null;
  if (p.reviewed) return <StatusBadge status="done" label="Checked" />;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <StatusBadge status="approval" label={p.source === "ai_photo" ? "Read from a photo, check" : "From your description, check"} />
      <button type="button" disabled={readOnly} onClick={onAccept} className={buttonClasses("ghost", "sm")}>
        <CheckCircleIcon size={16} weight="bold" aria-hidden />
        Looks right
      </button>
    </span>
  );
}

export function LotsEditor({ projectId, baseVersion, document, points, readOnly }: { projectId: string; baseVersion: number; document: SurveyDocument; points: SurveyPoint[]; readOnly: string | null }) {
  const router = useRouter();
  const ro = Boolean(readOnly);
  const byNumber = useMemo(() => new Map(points.map((p) => [p.pointId, p])), [points]);
  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  const numbers = (ids: string[]) => ids.map((id) => byId.get(id)?.pointId ?? "?").join(" ");

  const [lots, setLots] = useState<LotRow[]>(document.lots.map((l) => ({ id: l.id, label: l.label, sup: l.sup, note: l.note, order: numbers(l.points) })));
  const [roads, setRoads] = useState<RoadRow[]>(document.roads.map((r) => ({ id: r.id, name: r.name, a: numbers(r.edgeA), b: numbers(r.edgeB), width: r.width, start: r.start, end: r.end })));
  const [adjoining, setAdjoining] = useState<Adjoining[]>(document.adjoining);
  const [features, setFeatures] = useState<DrawingFeature[]>(document.features);
  const [provenance, setProvenance] = useState<Provenance>(document.provenance);
  const [draft, setDraft] = useState<{ layer: DrawingFeature["layer"]; code: string; closed: boolean; points: string }>({ layer: "BUILDINGS", code: "", closed: true, points: "" });
  const [suggestions, setSuggestions] = useState<ReturnType<typeof suggestFeatures> | null>(null);
  const [message, setMessage] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const reviewed = (k: string) => setProvenance((p) => (p[k] ? { ...p, [k]: { ...p[k]!, reviewed: true } } : p));
  const unknownAll: string[] = [];
  const lotDocs: Lot[] = lots.map((l) => {
    const r = readOrder(l.order, byNumber);
    unknownAll.push(...r.unknown);
    return { id: l.id, label: l.label.trim(), sup: l.sup.trim(), note: l.note.trim(), points: r.ids };
  });
  const roadDocs: Road[] = roads.map((r) => {
    const a = readOrder(r.a, byNumber);
    const b = readOrder(r.b, byNumber);
    unknownAll.push(...a.unknown, ...b.unknown);
    return { id: r.id, name: r.name.trim(), edgeA: a.ids, edgeB: b.ids, width: r.width, start: r.start.trim(), end: r.end.trim() };
  });
  const plan = computeLots(points, lotDocs);
  const total = plan.outlineAreaM2 ?? (plan.sumAreaM2 > 0 ? plan.sumAreaM2 : null);
  // Marks for removed lots, roads, labels and lines go with them, so nothing is left waiting to be checked that isn't there.
  const next: SurveyDocument = pruneProvenance({ ...document, lots: lotDocs, roads: roadDocs, adjoining, features, provenance });
  const shortRoads = roadDocs.filter((r) => r.edgeA.length < 2).map((r) => r.name || "A road without a name");
  const changed = JSON.stringify([next.lots, next.roads, next.adjoining, next.features, next.provenance]) !== JSON.stringify([document.lots, document.roads, document.adjoining, document.features, document.provenance]);

  const addFeature = () => {
    const r = readOrder(draft.points, byNumber);
    if (r.unknown.length > 0) return setMessage({ tone: "error", text: `These point numbers aren't in the project: ${r.unknown.join(", ")}.` });
    if (r.ids.length < 2) return setMessage({ tone: "error", text: "A line needs at least two points." });
    setFeatures((f) => [...f, { id: newId("f"), layer: draft.layer, code: draft.code.trim().slice(0, 12), closed: draft.closed && r.ids.length >= 3, points: r.ids }]);
    setDraft((d) => ({ ...d, code: "", points: "" }));
    setMessage(null);
  };

  const save = () =>
    start(async () => {
      if (unknownAll.length > 0) return setMessage({ tone: "error", text: `These point numbers aren't in the project: ${[...new Set(unknownAll)].join(", ")}.` });
      if (shortRoads.length > 0) return setMessage({ tone: "error", text: `${shortRoads.join(", ")} needs at least two points along its first edge. Add them, or remove the road.` });
      const r = await saveSurveyDrawingAction({ projectId, baseVersion, document: next, note: "Lots, roads and features" });
      if (r.status === "done") {
        setMessage({ tone: "done", text: r.message });
        router.refresh();
      } else if (r.status === "error") setMessage({ tone: "error", text: r.message });
    });

  return (
    <div className="grid gap-8">
      <section className="grid gap-3" aria-labelledby="lots-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="lots-title" className="font-medium text-ink">
            Lots
          </h3>
          {total !== null ? (
            <p className="text-sm text-ink-2">
              Entire land <span className="tabular font-medium text-ink">{hectares(total)} ha</span> ({arpClassic(toArp(total, document.settings.perchDecimals))})
            </p>
          ) : null}
        </div>
        <p className="text-sm text-ink-2">Each lot&apos;s corners in order round it. Lots that share a leg use the same corner points along it. Nothing is reordered or closed for you.</p>
        <ul className="grid gap-3">
          {lots.map((l, i) => {
            const r = plan.lots[i];
            const p = r?.parcel;
            const problems = [
              ...(r && r.missing.length ? ["Some corners are no longer in the project."] : []),
              ...(p && p.vertices.length > 0 && p.vertices.length < 3 ? ["Add at least three corners."] : []),
              ...(p && p.crossings.length ? ["The boundary crosses itself: check the order."] : []),
              ...(p && p.repeatedPoints.length ? [`Point ${p.repeatedPoints.join(", ")} is used twice.`] : []),
              ...(p && p.zeroLegs.length ? ["Two corners sit on the same spot."] : []),
              ...plan.overlaps.filter(([a, b]) => a === i || b === i).map(([a, b]) => `Overlaps lot ${lotName(lotDocs[a === i ? b : a]!)}.`),
            ];
            return (
              <li key={l.id} className="grid gap-3 rounded-md bg-surface p-4 ring-1 ring-line">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink">
                    Lot {l.label || "?"}
                    {l.sup ? <sup>{l.sup}</sup> : null}
                  </p>
                  <Provenanced provenance={provenance} k={`lot:${l.id}`} onAccept={() => reviewed(`lot:${l.id}`)} readOnly={ro} />
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[6rem_6rem_minmax(0,1fr)_auto]">
                  <label className="grid gap-1.5">
                    <span className={LABEL_CLASSES}>Label</span>
                    <input value={l.label} maxLength={12} disabled={ro} onChange={(e) => (setLots((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x))), reviewed(`lot:${l.id}`))} className={inputClasses()} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className={LABEL_CLASSES}>Raised</span>
                    <input value={l.sup} maxLength={6} disabled={ro} placeholder="1" onChange={(e) => (setLots((all) => all.map((x, j) => (j === i ? { ...x, sup: e.target.value } : x))), reviewed(`lot:${l.id}`))} className={inputClasses()} />
                  </label>
                  <label className="col-span-3 grid gap-1.5 sm:col-span-1">
                    <span className={LABEL_CLASSES}>Note (optional)</span>
                    <input value={l.note} maxLength={80} disabled={ro} placeholder="Res. for Access, 10ft. wide" onChange={(e) => (setLots((all) => all.map((x, j) => (j === i ? { ...x, note: e.target.value } : x))), reviewed(`lot:${l.id}`))} className={inputClasses()} />
                  </label>
                  <button type="button" aria-label={`Remove lot ${l.label}${l.sup}`} disabled={ro} onClick={() => (setLots((all) => all.filter((_, j) => j !== i)), setAdjoining((a) => a.filter((x) => x.lot !== l.id)))} className={buttonClasses("ghost", "sm", "size-11 px-0 self-end")}>
                    <TrashIcon size={16} weight="bold" aria-hidden />
                  </button>
                </div>
                <label className="grid gap-1.5">
                  <span className={LABEL_CLASSES}>Corners, in order</span>
                  <input value={l.order} disabled={ro} placeholder="1 2 3 8 7" onChange={(e) => (setLots((all) => all.map((x, j) => (j === i ? { ...x, order: e.target.value } : x))), reviewed(`lot:${l.id}`))} className={inputClasses()} />
                </label>
                {p && p.vertices.length >= 3 && p.crossings.length === 0 ? (
                  <p className="text-sm text-ink-2">
                    <span className="tabular font-medium text-ink">{arpClassic(toArp(p.areaM2, document.settings.perchDecimals))}</span>, {hectares(p.areaM2)} ha, {fmt(p.areaM2, 2)} m². Perimeter {fmt(p.perimeterM, 2)} m over {p.legs.length} legs.
                  </p>
                ) : null}
                {problems.map((t) => (
                  <Problem key={t} text={t} />
                ))}
              </li>
            );
          })}
        </ul>
        {plan.holes > 0 ? <Problem text="There's a gap between the lots that no lot covers: check the shared corners." /> : null}
        <button type="button" disabled={ro || lots.length >= 60} onClick={() => setLots((all) => [...all, { id: newId("lot"), label: all.length ? String.fromCharCode(65 + Math.min(all.length, 25)) : "A", sup: "", note: "", order: "" }])} className={buttonClasses("secondary", "sm", "justify-self-start")}>
          <PlusIcon size={16} weight="bold" aria-hidden />
          Add a lot
        </button>
      </section>

      <section className="grid gap-3" aria-labelledby="roads-title">
        <h3 id="roads-title" className="font-medium text-ink">
          Roads
        </h3>
        <p className="text-sm text-ink-2">A road from its two surveyed edges. Its width on the plan is measured square across the edges, never typed.</p>
        <ul className="grid gap-3">
          {roads.map((r, i) => {
            const d = roadDocs[i]!;
            const pa = d.edgeA.map((id) => byId.get(id)!).filter(Boolean);
            const pb = d.edgeB.map((id) => byId.get(id)!).filter(Boolean);
            const w = roadWidth(pa, pb);
            const set = (patch: Partial<RoadRow>) => (setRoads((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x))), reviewed(`road:${r.id}`));
            return (
              <li key={r.id} className="grid gap-3 rounded-md bg-surface p-4 ring-1 ring-line">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink">{r.name || "Road"}</p>
                  <Provenanced provenance={provenance} k={`road:${r.id}`} onAccept={() => reviewed(`road:${r.id}`)} readOnly={ro} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className={LABEL_CLASSES}>Name</span>
                    <input value={r.name} maxLength={80} disabled={ro} onChange={(e) => set({ name: e.target.value })} className={inputClasses()} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className={LABEL_CLASSES}>Width written in</span>
                    <select value={r.width} disabled={ro} onChange={(e) => set({ width: e.target.value as Road["width"] })} className={inputClasses()}>
                      <option value="feet">Feet</option>
                      <option value="metres">Metres</option>
                      <option value="none">Not written</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className={LABEL_CLASSES}>One edge, points in order</span>
                    <input value={r.a} disabled={ro} onChange={(e) => set({ a: e.target.value })} className={inputClasses()} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className={LABEL_CLASSES}>Other edge, points in order</span>
                    <input value={r.b} disabled={ro} onChange={(e) => set({ b: e.target.value })} className={inputClasses()} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className={LABEL_CLASSES}>At the first end (optional)</span>
                    <input value={r.start} maxLength={60} disabled={ro} placeholder="From Main Road" onChange={(e) => set({ start: e.target.value })} className={inputClasses()} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className={LABEL_CLASSES}>At the last end (optional)</span>
                    <input value={r.end} maxLength={60} disabled={ro} placeholder="To Houses" onChange={(e) => set({ end: e.target.value })} className={inputClasses()} />
                  </label>
                </div>
                <p className="text-sm text-ink-2">{w ? `Width ${fmt(w.minM, 2)} to ${fmt(w.maxM, 2)} m, written ${roadWidthText(w.minM, w.maxM, r.width === "metres" ? "metres" : "feet")}.` : "Give both edges to measure the width."}</p>
                <button type="button" disabled={ro} onClick={() => setRoads((all) => all.filter((_, j) => j !== i))} className={buttonClasses("ghost", "sm", "justify-self-start")}>
                  <TrashIcon size={16} weight="bold" aria-hidden />
                  Remove this road
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" disabled={ro || roads.length >= 20} onClick={() => setRoads((all) => [...all, { id: newId("road"), name: "", a: "", b: "", width: "feet", start: "", end: "" }])} className={buttonClasses("secondary", "sm", "justify-self-start")}>
          <PlusIcon size={16} weight="bold" aria-hidden />
          Add a road
        </button>
      </section>

      <section className="grid gap-3" aria-labelledby="adjoining-title">
        <h3 id="adjoining-title" className="font-medium text-ink">
          Adjoining lands
        </h3>
        <p className="text-sm text-ink-2">Written outside a lot&apos;s leg with an arrow, as you found them: &ldquo;Land claimed by …&rdquo;, &ldquo;Lot 2 in Plan No. …&rdquo;.</p>
        <ul className="grid gap-3">
          {adjoining.map((a, i) => {
            const lot = lotDocs.find((l) => l.id === a.lot);
            const set = (patch: Partial<Adjoining>) => (setAdjoining((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x))), reviewed(`adjoining:${a.id}`));
            return (
              <li key={a.id} className="grid gap-3 rounded-md bg-surface p-4 ring-1 ring-line">
                <Provenanced provenance={provenance} k={`adjoining:${a.id}`} onAccept={() => reviewed(`adjoining:${a.id}`)} readOnly={ro} />
                <label className="grid gap-1.5">
                  <span className={LABEL_CLASSES}>Text</span>
                  <input value={a.text} maxLength={200} disabled={ro} onChange={(e) => set({ text: e.target.value })} className={inputClasses()} />
                </label>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                  <label className="grid gap-1.5">
                    <span className={LABEL_CLASSES}>Beside lot</span>
                    <select value={a.lot} disabled={ro} onChange={(e) => set({ lot: e.target.value, ...firstLeg(lotDocs.find((l) => l.id === e.target.value)) })} className={inputClasses()}>
                      {lotDocs.map((l) => (
                        <option key={l.id} value={l.id} disabled={l.points.length < 2}>
                          {lotName(l) || "Without a label"}
                          {l.points.length < 2 ? " (no corners yet)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className={LABEL_CLASSES}>Leg</span>
                    <select value={lot ? legIndex(lot, a.from, a.to) : -1} disabled={ro || !lot} onChange={(e) => lot && set({ from: lot.points[Number(e.target.value)]!, to: lot.points[(Number(e.target.value) + 1) % lot.points.length]! })} className={inputClasses()}>
                      {lot && legIndex(lot, a.from, a.to) < 0 ? (
                        <option value={-1} disabled>
                          Choose a leg
                        </option>
                      ) : null}
                      {(lot?.points ?? []).map((id, k, all) => (
                        <option key={k} value={k}>
                          {byId.get(id)?.pointId ?? "?"} to {byId.get(all[(k + 1) % all.length]!)?.pointId ?? "?"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" aria-label="Remove this label" disabled={ro} onClick={() => setAdjoining((all) => all.filter((_, j) => j !== i))} className={buttonClasses("ghost", "sm", "size-11 px-0")}>
                    <TrashIcon size={16} weight="bold" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <button type="button" disabled={ro || !lotDocs.some((l) => l.points.length >= 2) || adjoining.length >= 80} onClick={() => {
            const lot = lotDocs.find((l) => l.points.length >= 2)!;
            setAdjoining((all) => [...all, { id: newId("adj"), text: "Land claimed by", lot: lot.id, ...firstLeg(lot) }]);
          }} className={buttonClasses("secondary", "sm", "justify-self-start")}>
          <PlusIcon size={16} weight="bold" aria-hidden />
          Add an adjoining land
        </button>
      </section>

      <section className="grid gap-3" aria-labelledby="features-title">
        <h3 id="features-title" className="font-medium text-ink">
          Buildings, walls, fences and drains
        </h3>
        <p className="text-sm text-ink-2">Lines and outlines through points already imported, on their own layers.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={ro} onClick={() => setSuggestions(suggestFeatures(points, document.codes).filter((s) => !features.some((f) => f.code === s.code && f.points.join() === s.points.join())))} className={buttonClasses("secondary", "sm")}>
            <ListPlusIcon size={16} weight="bold" aria-hidden />
            Suggest lines from the field codes
          </button>
          <span className="text-sm text-ink-3">Consecutive points with the same line code become one line. You add the ones that are right.</span>
        </div>
        {suggestions ? (
          suggestions.length === 0 ? (
            <p className="text-sm text-ink-2">No new lines found in the field codes.</p>
          ) : (
            <ul className="grid gap-2 rounded-md bg-canvas-2 p-3 ring-1 ring-line">
              {suggestions.map((s, i) => (
                <li key={i} className="flex min-h-11 flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-ink">{s.meaning}</span>
                  <span className="min-w-0 flex-1 text-sm text-ink-2">
                    {s.code}, points {s.pointNumbers.join(" ")}
                    {s.closed ? ", closed" : ""}
                  </span>
                  <button type="button" disabled={ro} onClick={() => (setFeatures((f) => [...f, { id: newId("f"), layer: s.layer, code: s.code, closed: s.closed, points: s.points }]), setSuggestions((all) => all?.filter((_, j) => j !== i) ?? null))} className={buttonClasses("ghost", "sm")}>
                    <PlusIcon size={16} weight="bold" aria-hidden />
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {features.length > 0 ? (
          <ul className="grid gap-2">
            {features.map((f, i) => (
              <li key={f.id} className="flex min-h-11 items-center gap-3 rounded-sm bg-surface px-3 ring-1 ring-line">
                <span className="text-sm font-medium text-ink">{FEATURE_LABELS[f.layer]}</span>
                {f.code ? <span className="text-sm text-ink-2">{f.code}</span> : null}
                <span className="min-w-0 flex-1 truncate text-sm text-ink-3">{numbers(f.points)}</span>
                <button type="button" aria-label={`Remove this ${FEATURE_LABELS[f.layer].toLowerCase()}`} disabled={ro} onClick={() => setFeatures((all) => all.filter((_, j) => j !== i))} className={buttonClasses("ghost", "sm", "size-11 px-0")}>
                  <TrashIcon size={16} weight="bold" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="grid gap-3 rounded-md bg-canvas-2 p-3 ring-1 ring-line sm:grid-cols-[10rem_6rem_minmax(0,1fr)]">
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>Kind</span>
            <select value={draft.layer} disabled={ro} onChange={(e) => setDraft((d) => ({ ...d, layer: e.target.value as DrawingFeature["layer"], closed: e.target.value === "BUILDINGS" }))} className={inputClasses()}>
              {FEATURE_LAYERS.map((l) => (
                <option key={l} value={l}>
                  {FEATURE_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>Code</span>
            <input value={draft.code} maxLength={12} disabled={ro} onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} placeholder="MW" className={inputClasses()} />
          </label>
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>Points, in order</span>
            <input value={draft.points} disabled={ro} onChange={(e) => setDraft((d) => ({ ...d, points: e.target.value }))} placeholder="13 14 15 16" className={inputClasses()} />
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm text-ink sm:col-span-2">
            <input type="checkbox" checked={draft.closed} disabled={ro} onChange={(e) => setDraft((d) => ({ ...d, closed: e.target.checked }))} className="size-5 accent-[var(--color-accent)]" />
            Closed outline
          </label>
          <button type="button" onClick={addFeature} disabled={ro} className={buttonClasses("secondary", "sm", "self-end")}>
            <PlusIcon size={16} weight="bold" aria-hidden />
            Add line
          </button>
        </div>
      </section>

      {unknownAll.length > 0 ? <Problem text={`Not in this project: ${[...new Set(unknownAll)].join(", ")}.`} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={ro || pending || !changed} className={buttonClasses("primary", "md")}>
          {pending ? "Saving…" : "Save as a new version"}
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
