"use client";

/**
 * The plan editor's side panels (moved out of plan-editor.tsx unchanged, stage 195): what a picked item's figures are and where they
 * come from, the sheet's title fields and settings, and the code library.
 */
import {
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useId, useState } from "react";
import { formatDms, formatQuadrant, toDms } from "@/core/survey/angles";
import { CODE_KINDS, LINE_STYLES, commonCodes, dsrCodes, type CodeKind, type LineStyle } from "@/core/survey/codes";
import { runsText, titleSentence } from "@/core/survey/description";
import { STANDARD_SCALES, lotName, type SurveyDocument } from "@/core/survey/document";
import { roadWidth } from "@/core/survey/roads";
import { UDA_2020, readDecimal, reviewNote } from "@/core/survey/rules";
import type { SurveyPoint } from "@/core/survey/parcel";
import { fmt } from "@/core/survey/sheet/compose";
import { fromSquareMetres, formatArp, toArp } from "@/core/survey/units";
import { buildPlan } from "@/core/survey/view";
import { LAYER_NAMES } from "@/core/survey/assistant/describe";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses, textareaClasses } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";

export interface SurveyorOption {
  userId: string;
  name: string;
  designation: string;
  registration: string;
  address: string;
  contact: string;
}

export function describeSelection(entity: string | null, plan: ReturnType<typeof buildPlan>, points: SurveyPoint[], doc: SurveyDocument): { title: string; rows: [string, string][]; note?: string } | null {
  if (!entity) return null;
  if (entity.startsWith("leg:")) {
    const [, lotId, i] = entity.split(":");
    const leg = plan.lots.lots.find((r) => r.lot.id === lotId)?.parcel?.legs[Number(i)];
    if (!leg) return null;
    return {
      title: `Leg ${leg.from.pointId} to ${leg.to.pointId}`,
      rows: [
        ["Bearing", leg.bearing === null ? "None" : formatDms(toDms(leg.bearing, 1))],
        ["Quadrant", leg.bearing === null ? "None" : formatQuadrant(leg.bearing, 1)],
        ["Distance", `${fmt(leg.distance, 4)} m`],
      ],
      note: "Computed from the two points' coordinates. To change it, import corrected points.",
    };
  }
  if (entity.startsWith("pt:") || entity.startsWith("mark:")) {
    const id = entity.slice(entity.indexOf(":") + 1);
    const pt = points.find((x) => x.id === id);
    if (!pt) return null;
    return {
      title: `Point ${pt.pointId}`,
      rows: [
        ["Easting", `${fmt(pt.e, 4)} m`],
        ["Northing", `${fmt(pt.n, 4)} m`],
        ["Elevation", pt.z === null ? "None" : `${fmt(pt.z, 3)} m`],
        ["Code", pt.code ?? "None"],
      ],
      note: "Imported, so it can't be edited here. Its label can be moved.",
    };
  }
  if (entity.startsWith("lot:") || entity.startsWith("lot-extent:")) {
    const id = entity.slice(entity.indexOf(":") + 1);
    const r = plan.lots.lots.find((x) => x.lot.id === id);
    const p = r?.parcel;
    if (!r || !p) return null;
    return {
      title: `Lot ${lotName(r.lot)}`,
      rows: [
        ["Extent", formatArp(toArp(p.areaM2, doc.settings.perchDecimals))],
        ["Hectares", fmt(fromSquareMetres(p.areaM2, "ha"), 6)],
        ["Square metres", fmt(p.areaM2, 3)],
        ["Perimeter", `${fmt(p.perimeterM, 3)} m`],
        ["Corners", p.vertices.map((v) => v.pointId).join(", ")],
      ],
      note: "Grid area by the coordinate method. Change its corners on the Lots step.",
    };
  }
  if (entity.startsWith("road")) {
    const id = entity.slice(entity.indexOf(":") + 1);
    const road = doc.roads.find((x) => x.id === id);
    if (!road) return null;
    const a = road.edgeA.map((i) => points.find((x) => x.id === i)).filter((x): x is SurveyPoint => Boolean(x));
    const b = road.edgeB.map((i) => points.find((x) => x.id === i)).filter((x): x is SurveyPoint => Boolean(x));
    const w = roadWidth(a, b);
    return {
      title: road.name || "Road",
      rows: [
        ["Width", w ? `${fmt(w.minM, 3)} to ${fmt(w.maxM, 3)} m` : "Needs both edges"],
        ["Edges", `${a.map((p) => p.pointId).join(", ")} | ${b.map((p) => p.pointId).join(", ")}`],
      ],
      note: "The width is measured square across from each edge's points, never typed.",
    };
  }
  if (entity.startsWith("adjoining:")) {
    const a = doc.adjoining.find((x) => `adjoining:${x.id}` === entity);
    if (!a) return null;
    const lot = doc.lots.find((l) => l.id === a.lot);
    const num = (id: string) => points.find((x) => x.id === id)?.pointId ?? "?";
    return { title: "Adjoining land", rows: [["Text", a.text], ["Beside", lot ? `Lot ${lotName(lot)}, between ${num(a.from)} and ${num(a.to)}` : "No lot"]], note: "Change it on the Lots step." };
  }
  if (entity.startsWith("feature:")) {
    const f = doc.features.find((x) => `feature:${x.id}` === entity);
    if (!f) return null;
    const names = f.points.map((id) => points.find((x) => x.id === id)?.pointId ?? "?");
    return { title: `${LAYER_NAMES[f.layer]} ${f.code}`.trim(), rows: [["Points", names.join(", ")], ["Shape", f.closed ? "Closed outline" : "Open line"]], note: "Change features on the Lots step." };
  }
  return null;
}

export type Update = (c: (d: SurveyDocument) => void, key?: string) => void;

/** Marks a field the AI filled as reviewed once the surveyor edits it: changing it is checking it. */
const touched = (d: SurveyDocument, key: string) => {
  const p = d.provenance[key];
  if (p) d.provenance[key] = { ...p, reviewed: true };
};

/** An AI-filled field waiting for the surveyor: they confirm it as it is, or change it (which counts as checking it). */
function CheckMark({ doc, field, update, readOnly }: { doc: SurveyDocument; field: string; update: Update; readOnly: boolean }) {
  const p = doc.provenance[field];
  if (!p || p.reviewed || p.source === "engine") return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <StatusBadge status="approval" label={p.source === "ai_photo" ? "Read from a photo, check" : p.source === "auto" ? "Drawn from the field data, check" : "From your description, check"} />
      <button type="button" disabled={readOnly} onClick={() => update((d) => touched(d, field))} className={buttonClasses("ghost", "sm")}>
        <CheckCircleIcon size={16} weight="bold" aria-hidden />
        Looks right
      </button>
    </span>
  );
}

export function SheetFields({ doc, update, readOnly, surveyors, suggested, paper }: { doc: SurveyDocument; update: Update; readOnly: boolean; surveyors: SurveyorOption[]; suggested: number | null; paper: string }) {
  // The label names the input by id, so the "Looks right" button beside it stays outside the label.
  const field = (label: string, value: string, key: string, set: (d: SurveyDocument, v: string) => void, max: number, opts: { long?: boolean; hint?: string; type?: string } = {}) => {
    const id = `sheet-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    return (
      <div className="grid gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className={LABEL_CLASSES}>
            {label}
          </label>
          <CheckMark doc={doc} field={`sheet.${key}`} update={update} readOnly={readOnly} />
        </span>
        {opts.long ? (
          <textarea id={id} value={value} maxLength={max} rows={3} disabled={readOnly} onChange={(e) => update((d) => (set(d, e.target.value), touched(d, `sheet.${key}`)), key)} className={textareaClasses()} />
        ) : (
          <input id={id} type={opts.type ?? "text"} value={value} maxLength={max} disabled={readOnly} onChange={(e) => update((d) => (set(d, e.target.value), touched(d, `sheet.${key}`)), key)} className={inputClasses()} />
        )}
        {opts.hint ? <span className="text-sm text-ink-3">{opts.hint}</span> : null}
      </div>
    );
  };
  const check = (label: string, checked: boolean, set: (d: SurveyDocument, v: boolean) => void) => (
    <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
      <input type="checkbox" checked={checked} disabled={readOnly} onChange={(e) => update((d) => set(d, e.target.checked))} className="size-5 accent-[var(--color-accent)]" />
      {label}
    </label>
  );
  const s = doc.sheet;
  const st = doc.settings;
  const sentence = runsText(titleSentence(s, doc.lots, s.extractOf ? (doc.lots.find((l) => l.id === s.extractOf) ?? null) : null));
  return (
    <div className="grid gap-5 rounded-md bg-surface p-4 ring-1 ring-line">
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium text-ink">Sheet</legend>
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Layout</span>
          <select value={st.template} disabled={readOnly} onChange={(e) => update((d) => void (d.settings.template = e.target.value as SurveyDocument["settings"]["template"]))} className={inputClasses()}>
            <option value="classic">Classic Sri Lankan plan</option>
            <option value="panel">Panel layout</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>Paper</span>
            <select value={st.paper} disabled={readOnly} onChange={(e) => update((d) => void (d.settings.paper = e.target.value as SurveyDocument["settings"]["paper"]))} className={inputClasses()}>
              <option value="auto">Automatic ({paper})</option>
              <option value="A4">A4</option>
              <option value="A3">A3</option>
              <option value="A2">A2</option>
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>Orientation</span>
            <select value={st.orientation} disabled={readOnly} onChange={(e) => update((d) => void (d.settings.orientation = e.target.value as SurveyDocument["settings"]["orientation"]))} className={inputClasses()}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
        </div>
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Scale</span>
          <select value={st.scale ?? ""} disabled={readOnly} onChange={(e) => update((d) => void (d.settings.scale = e.target.value ? Number(e.target.value) : null))} className={inputClasses()}>
            <option value="">{suggested ? `Automatic, 1:${fmt(suggested, 0)}` : "Automatic"}</option>
            {STANDARD_SCALES.map((sc) => (
              <option key={sc} value={sc}>
                1:{fmt(sc, 0)}
              </option>
            ))}
          </select>
        </label>
        {check("Slanted lettering", st.slant, (d, v) => void (d.settings.slant = v))}
        {check("Bearings and distances on the face", st.faceDimensions, (d, v) => void (d.settings.faceDimensions = v))}
        {check("Boundaries schedule overleaf", st.overleaf, (d, v) => void (d.settings.overleaf = v))}
        {check("Development permit box (UDA areas, panel layout)", st.permitBox, (d, v) => void (d.settings.permitBox = v))}
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Extract of one lot</span>
          <select value={s.extractOf} disabled={readOnly || doc.lots.length < 2} onChange={(e) => update((d) => void (d.sheet.extractOf = e.target.value))} className={inputClasses()}>
            <option value="">No, the whole plan</option>
            {doc.lots.map((l) => (
              <option key={l.id} value={l.id}>
                Lot {lotName(l)}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium text-ink">Planning minimums</legend>
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Check the lots against</span>
          <select
            value={doc.rules?.id ?? ""}
            disabled={readOnly}
            onChange={(e) => {
              const v = e.target.value;
              update((d) => void (d.rules = v === "uda-2020" ? { id: "uda-2020" } : v === "own" ? { id: "own", areaM2: 0, frontageM: 0, depthM: 0, source: "" } : null));
            }}
            className={inputClasses()}
          >
            <option value="">No minimums</option>
            <option value="uda-2020">
              UDA regulations: {UDA_2020.minimums.areaM2} m², {UDA_2020.minimums.frontageM} m frontage, {UDA_2020.minimums.depthM} m depth
            </option>
            <option value="own">Minimums I enter, from a Development Plan or other rule</option>
          </select>
        </label>
        {doc.rules?.id === "own" ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <MinimumField label="Least area (m²)" value={doc.rules.areaM2} max={10_000_000} disabled={readOnly} onCommit={(v) => update((d) => void (d.rules?.id === "own" && (d.rules.areaM2 = v)), "rules.areaM2")} />
              <MinimumField label="Frontage (m)" value={doc.rules.frontageM} max={10_000} disabled={readOnly} onCommit={(v) => update((d) => void (d.rules?.id === "own" && (d.rules.frontageM = v)), "rules.frontageM")} />
              <MinimumField label="Depth (m)" value={doc.rules.depthM} max={10_000} disabled={readOnly} onCommit={(v) => update((d) => void (d.rules?.id === "own" && (d.rules.depthM = v)), "rules.depthM")} />
            </div>
            <label className="grid gap-1.5">
              <span className={LABEL_CLASSES}>Where they come from</span>
              <input value={doc.rules.source} maxLength={200} disabled={readOnly} placeholder="The Development Plan and zone, for example" onChange={(e) => update((d) => void (d.rules?.id === "own" && (d.rules.source = e.target.value)), "rules.source")} className={inputClasses()} />
            </label>
          </>
        ) : null}
        <p className="text-sm text-ink-3">
          {doc.rules?.id === "uda-2020" ? `For ${UDA_2020.appliesTo}. ${reviewNote(UDA_2020, new Date().toISOString().slice(0, 10)) ?? ""} ` : doc.rules?.id === "own" ? "Use 0 for a minimum that doesn't apply. " : ""}
          Lots whose note starts &ldquo;Res.&rdquo; aren&apos;t checked, and frontage runs along a road or a reserved access lot. What&apos;s short shows on the Check step as a warning.
        </p>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium text-ink">Title</legend>
        {field("Plan number", s.planNumber, "planNumber", (d, v) => void (d.sheet.planNumber = v), 40)}
        {field("Land called", s.landName, "landName", (d, v) => void (d.sheet.landName = v), 120)}
        <div className="grid grid-cols-2 gap-3">
          {field("Alias", s.alias, "alias", (d, v) => void (d.sheet.alias = v), 160, { hint: "Several joined by “and”." })}
          {field("Now called and known as", s.nowKnownAs, "nowKnownAs", (d, v) => void (d.sheet.nowKnownAs = v), 120)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <span className="flex flex-wrap items-center gap-2">
              <label htmlFor="sheet-operation" className={LABEL_CLASSES}>
                The survey
              </label>
              <CheckMark doc={doc} field="sheet.operation" update={update} readOnly={readOnly} />
            </span>
            <select id="sheet-operation" value={s.operation} disabled={readOnly} onChange={(e) => update((d) => (void (d.sheet.operation = e.target.value as SurveyDocument["sheet"]["operation"]), touched(d, "sheet.operation")))} className={inputClasses()}>
              <option value="resurvey">Resurvey of the existing boundaries</option>
              <option value="subdivision">Resurvey and sub division</option>
              <option value="amalgamation">Resurvey and amalgamation</option>
              <option value="custom">My own wording</option>
            </select>
          </div>
          {field(s.operation === "amalgamation" ? "Of lots" : "Of lot", s.parentLots, "parentLots", (d, v) => void (d.sheet.parentLots = v), 60)}
        </div>
        {s.operation === "custom" ? field("After “being”", s.customClause, "customClause", (d, v) => void (d.sheet.customClause = v), 800, { long: true }) : null}
        <div className="grid grid-cols-2 gap-3">
          {field("Depicted in Plan No.", s.previousPlan.number, "previousPlan.number", (d, v) => void (d.sheet.previousPlan.number = v), 40)}
          {field("Dated", s.previousPlan.date, "previousPlan.date", (d, v) => void (d.sheet.previousPlan.date = v), 20, { type: "date" })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {check("It's my own earlier plan (“my Plan No.”)", s.previousPlan.mine, (d, v) => (void (d.sheet.previousPlan.mine = v), touched(d, "sheet.previousPlan.mine")))}
          <CheckMark doc={doc} field="sheet.previousPlan.mine" update={update} readOnly={readOnly} />
        </div>
        {s.previousPlan.mine && !doc.provenance["sheet.previousPlan.by"] ? null : (
          <div className="grid grid-cols-2 gap-3">
            {field("Made by", s.previousPlan.by, "previousPlan.by", (d, v) => void (d.sheet.previousPlan.by = v), 80)}
            {field("Their designation", s.previousPlan.byDesignation, "previousPlan.byDesignation", (d, v) => void (d.sheet.previousPlan.byDesignation = v), 60)}
          </div>
        )}
        {field("Filed of record in (optional)", s.previousPlan.filing, "previousPlan.filing", (d, v) => void (d.sheet.previousPlan.filing = v), 160, { hint: "A court and case number, when the plan was filed." })}
        <div className="grid grid-cols-2 gap-3">
          {field("Village", s.village, "village", (d, v) => void (d.sheet.village = v), 60)}
          {field("Pattu", s.pattu, "pattu", (d, v) => void (d.sheet.pattu = v), 60, { hint: "As written, ending in “Pattu”." })}
          {field("Korale", s.korale, "korale", (d, v) => void (d.sheet.korale = v), 60, { hint: "As written, ending in “Korale”." })}
          {field("District", s.district, "district", (d, v) => void (d.sheet.district = v), 60)}
          {field("Province", s.province, "province", (d, v) => void (d.sheet.province = v), 60)}
          {field("GN division (optional)", s.gnDivision, "gnDivision", (d, v) => void (d.sheet.gnDivision = v), 60)}
        </div>
        <div className="rounded-sm bg-canvas-2 p-3 text-sm leading-relaxed text-ink-2 ring-1 ring-line">
          <span className="font-medium text-ink">PLAN</span> {sentence}
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-ink">Bounded as follows</legend>
        <p className="text-sm text-ink-3">What adjoins each side of the entire land, as you found it. Farbaek never makes these up.</p>
        {field("North by", s.boundaries.north, "boundaries.north", (d, v) => void (d.sheet.boundaries.north = v), 200)}
        {field("East by", s.boundaries.east, "boundaries.east", (d, v) => void (d.sheet.boundaries.east = v), 200)}
        {field("South by", s.boundaries.south, "boundaries.south", (d, v) => void (d.sheet.boundaries.south = v), 200)}
        {field("West by", s.boundaries.west, "boundaries.west", (d, v) => void (d.sheet.boundaries.west = v), 200)}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-ink">Dates and statements</legend>
        <div className="grid grid-cols-2 gap-3">
          {field("Surveyed on", s.surveyDate, "surveyDate", (d, v) => void (d.sheet.surveyDate = v), 20, { type: "date" })}
          {field("Partitioned on", s.partitionDate, "partitionDate", (d, v) => void (d.sheet.partitionDate = v), 20, { type: "date" })}
          {field("Signed on", s.planDate, "planDate", (d, v) => void (d.sheet.planDate = v), 20, { type: "date" })}
        </div>
        {field("Statement", s.statement, "statement", (d, v) => void (d.sheet.statement = v), 200, { hint: "Printed bottom left, as surveyors write how the boundaries were found." })}
        {field("Stated extent (from the deed or an earlier plan)", s.statedExtent, "statedExtent", (d, v) => void (d.sheet.statedExtent = v), 80, { hint: "Kept apart from the computed extent, in the schedule overleaf." })}
        <div className="grid gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <label htmlFor="sheet-notes" className={LABEL_CLASSES}>
              Notes on the plan
            </label>
            <CheckMark doc={doc} field="notes" update={update} readOnly={readOnly} />
          </span>
          <textarea id="sheet-notes" value={doc.notes.join("\n")} rows={3} maxLength={3000} disabled={readOnly} onChange={(e) => update((d) => (void (d.notes = e.target.value.split("\n").map((x) => x.slice(0, 300)).filter((x, i, a) => x.trim() || i < a.length - 1).slice(0, 10)), touched(d, "notes")), "notes")} className={textareaClasses()} />
          <span className="text-sm text-ink-3">One per line, printed as “Note:- …” under the Reference.</span>
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-ink">Surveyor</legend>
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>The licensed surveyor responsible for this plan</span>
          <select value={doc.surveyorUserId ?? ""} disabled={readOnly} onChange={(e) => update((d) => void (d.surveyorUserId = e.target.value || null))} className={inputClasses()}>
            <option value="">Not chosen yet</option>
            {surveyors.map((sv) => (
              <option key={sv.userId} value={sv.userId}>
                {sv.name}
                {sv.registration ? ` (${sv.registration})` : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-ink-3">Surveyors enter their own details under Surveyor details. Only they can approve a plan they are named on.</p>
      </fieldset>
    </div>
  );
}

const KIND_LABELS: Record<CodeKind, string> = { mark: "Mark at a point", line: "Line through points", outline: "Closed outline", symbol: "Symbol" };
const STYLE_LABELS: Record<LineStyle, string> = { solid: "Solid", dashed: "Dashed", ticked: "Ticked" };

/** The code library: what each field code means and how it's drawn. */
export function CodesPanel({ doc, update, readOnly }: { doc: SurveyDocument; update: Update; readOnly: boolean }) {
  const reviewed = doc.provenance["codes"]?.reviewed === true;
  return (
    <div className="grid gap-4 rounded-md bg-surface p-4 ring-1 ring-line">
      <p className="text-sm text-ink-2">Codes your instrument records with each point. The Reference on the plan lists only the codes it uses. The starting list is common Sri Lankan usage, not an official one.</p>
      <ul className="grid gap-3">
        {doc.codes.map((c, i) => (
          <li key={i} className="grid gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-end gap-2">
              <label className="grid gap-1">
                <span className="text-xs text-ink-3">Code</span>
                <input value={c.code} maxLength={12} disabled={readOnly} onChange={(e) => update((d) => void (d.codes[i]!.code = e.target.value), `cc${i}`)} className={inputClasses()} />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-ink-3">Meaning</span>
                <input value={c.meaning} maxLength={60} disabled={readOnly} onChange={(e) => update((d) => void (d.codes[i]!.meaning = e.target.value), `cm${i}`)} className={inputClasses()} />
              </label>
              <button type="button" aria-label={`Remove ${c.code || "this code"}`} disabled={readOnly} onClick={() => update((d) => void d.codes.splice(i, 1))} className={buttonClasses("ghost", "sm", "size-11 px-0")}>
                <TrashIcon size={16} weight="bold" aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="text-xs text-ink-3">Drawn as</span>
                <select value={c.kind} disabled={readOnly} onChange={(e) => update((d) => void (d.codes[i]!.kind = e.target.value as CodeKind))} className={inputClasses()}>
                  {CODE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-ink-3">Line</span>
                <select value={c.line} disabled={readOnly || c.kind === "mark" || c.kind === "symbol"} onChange={(e) => update((d) => void (d.codes[i]!.line = e.target.value as LineStyle))} className={inputClasses()}>
                  {LINE_STYLES.map((k) => (
                    <option key={k} value={k}>
                      {STYLE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
              <input type="checkbox" checked={c.legend} disabled={readOnly} onChange={(e) => update((d) => void (d.codes[i]!.legend = e.target.checked))} className="size-5 accent-[var(--color-accent)]" />
              In the Reference when used
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={readOnly || doc.codes.length >= 80} onClick={() => update((d) => void d.codes.push({ code: "X", meaning: "Describe it", kind: "mark", line: "solid", legend: true }))} className={buttonClasses("secondary", "sm")}>
          <PlusIcon size={16} weight="bold" aria-hidden />
          Add a code
        </button>
        <button type="button" disabled={readOnly} onClick={() => update((d) => ((d.codes = commonCodes()), void (d.provenance["codes"] = { source: "engine", reviewed: false })))} className={buttonClasses("ghost", "sm")}>
          Reset to the common list
        </button>
        <button type="button" disabled={readOnly} onClick={() => update((d) => ((d.codes = dsrCodes()), void (d.provenance["codes"] = { source: "engine", reviewed: false })))} className={buttonClasses("ghost", "sm")}>
          Use the Survey Department&apos;s codes
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        {reviewed ? (
          <StatusBadge status="done" label="Checked by you" />
        ) : (
          <button type="button" disabled={readOnly} onClick={() => update((d) => void (d.provenance["codes"] = { source: "engine", reviewed: true }))} className={buttonClasses("primary", "sm")}>
            <CheckCircleIcon size={16} weight="bold" aria-hidden />
            I&apos;ve checked these codes
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A minimum typed as text and committed only while it reads as a number from 0 to `max` (what the drawing can store), so a half-typed
 * "1." isn't lost. Anything else is said beside the field, and the stored minimum stays as it was until the field reads right.
 */
function MinimumField({ label, value, max, disabled, onCommit }: { label: string; value: number; max: number; disabled: boolean; onCommit: (v: number) => void }) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  // Undo or another change from outside: show the stored value again.
  if (value !== seen) {
    setSeen(value);
    if (readDecimal(text) !== value) setText(String(value));
  }
  const typed = readDecimal(text);
  const problem = !Number.isFinite(typed)
    ? `Use a number, or 0 if it doesn't apply. The last one, ${value}, is kept until then.`
    : typed > max
      ? `At most ${max.toLocaleString("en-GB")}.`
      : null;
  return (
    <label className="grid gap-1.5">
      <span className={LABEL_CLASSES}>{label}</span>
      <input
        value={text}
        inputMode="decimal"
        disabled={disabled}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? id : undefined}
        onChange={(e) => {
          const t = e.target.value.slice(0, 12);
          setText(t);
          const v = readDecimal(t);
          if (Number.isFinite(v) && v <= max) onCommit(v);
        }}
        className={inputClasses()}
      />
      {problem ? (
        <span id={id} className="text-sm text-failed">
          {problem}
        </span>
      ) : null}
    </label>
  );
}
