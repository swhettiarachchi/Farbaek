"use client";

import { DownloadSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { formatDms, toDms } from "@/core/survey/angles";
import { area, selfIntersections } from "@/core/survey/geometry";
import { lotName, type Lot } from "@/core/survey/document";
import { cell } from "@/core/survey/export/schedule";
import { arpClassic, hectares } from "@/core/survey/formats";
import type { SurveyPoint } from "@/core/survey/parcel";
import { partitionLot, widthRoom } from "@/core/survey/partition";
import { UDA_2020, ownRules, reviewNote } from "@/core/survey/rules";
import { PERCH_M2, fmt, toArp } from "@/core/survey/units";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, inputClasses } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";

type By = "area" | "width";
type Unit = "perch" | "m2" | "m" | "ft";

const FACTOR: Record<Unit, number> = { perch: PERCH_M2, m2: 1, m: 1, ft: 0.3048 };

/**
 * Divide a lot into shares (stage 193): the surveyor's choices in, the
 * engine's dividing lines out, as a proposal to peg. Nothing here changes the
 * plan: the proposed corners join it only once pegged, observed and imported.
 */
export function PartitionPanel({ lots, points, perchDecimals }: { lots: Lot[]; points: SurveyPoint[]; perchDecimals: number }) {
  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  // Lots that can be divided: three or more known corners, and a boundary that doesn't cross itself.
  const usable = lots.filter((l) => l.points.length >= 3 && l.points.every((id) => byId.has(id)) && selfIntersections(l.points.map((id) => byId.get(id)!)).length === 0);
  const [lotId, setLotId] = useState(usable[0]?.id ?? "");
  const [leg, setLeg] = useState(0);
  const [lines, setLines] = useState<"square" | "parallel" | "through">("square");
  const [corner, setCorner] = useState(0);
  const [from, setFrom] = useState<"start" | "end">("start");
  const [by, setBy] = useState<By>("area");
  const [unit, setUnit] = useState<Unit>("perch");
  const [shares, setShares] = useState<string[]>(["", ""]);
  const [ruleChoice, setRuleChoice] = useState<"none" | "uda" | "own">("none");
  const [own, setOwn] = useState({ areaM2: "", frontageM: "", depthM: "", source: "" });

  const lot = usable.find((l) => l.id === lotId) ?? usable[0];
  const ring = lot ? lot.points.map((id) => byId.get(id)!) : [];
  const legAt = Math.min(leg, Math.max(ring.length - 1, 0));
  const cornerAt = Math.min(corner, Math.max(ring.length - 1, 0));
  const parsed = shares.map((v) => (v.trim() === "" ? null : Number(v) * FACTOR[unit]));
  const invalid = parsed.some((x) => x !== null && !Number.isFinite(x));
  // The surveyor's own minimums count once all three are numbers and they've said where they come from.
  const ownMin = { areaM2: Number(own.areaM2), frontageM: Number(own.frontageM), depthM: Number(own.depthM) };
  const ownReady = [own.areaM2, own.frontageM, own.depthM].every((v) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0) && own.source.trim() !== "";
  const rules = ruleChoice === "uda" ? UDA_2020 : ruleChoice === "own" && ownReady ? ownRules(ownMin, own.source) : null;
  const result = lot && !invalid ? partitionLot({ ring, leg: legAt, lines, corner: cornerAt, from, by, shares: parsed, rules }) : null;
  // What the shares divide: the lot's area, or for widths the leg's length (square lines) or the lot's depth from the leg (parallel lines).
  const total = !lot ? null : by === "area" ? area(ring) : widthRoom({ ring, leg: legAt, lines, from });
  const pointAt = (k: number) => ring[((k % ring.length) + ring.length) % ring.length]?.pointId ?? "";

  if (usable.length === 0) return <p className="text-sm text-ink-2">Add a lot with at least three corners first.</p>;

  const equal = (k: number) => {
    if (!total) return;
    // Every share but the last gets the equal part, to the hundredth; the last takes what's left, so nothing is lost to rounding.
    const each = total / k / FACTOR[unit];
    setShares([...Array.from({ length: k - 1 }, () => (Math.floor(each * 100) / 100).toFixed(2)), ""]);
  };
  const chooseBy = (next: By) => {
    setBy(next);
    setUnit(next === "area" ? "perch" : "m");
    setShares((s) => s.map(() => ""));
  };
  const shown = (m2: number) => (unit === "perch" ? `${fmt(m2 / PERCH_M2, 2)} P` : `${fmt(m2, 2)} m²`);

  const download = () => {
    if (!result || !result.ok) return;
    const rows = ["corner,easting,northing,from_corner,towards_corner,distance_m", ...result.corners.filter((c) => !c.existing).map((c) => [cell(c.name), c.e.toFixed(3), c.n.toFixed(3), cell(c.from.pointId), cell(c.to.pointId), c.distanceM.toFixed(3)].join(","))];
    const blob = new Blob([`${rows.join("\r\n")}\r\n`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `setting-out-lot-${lot ? lotName(lot).replace(/[^A-Za-z0-9]+/g, "") || "x" : "x"}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    // Released a moment later: some browsers cancel a download whose link goes at once.
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Lot to divide</span>
          <select value={lot?.id ?? ""} onChange={(e) => (setLotId(e.target.value), setLeg(0), setCorner(0))} className={inputClasses()}>
            {usable.map((l) => (
              <option key={l.id} value={l.id}>
                Lot {lotName(l) || "without a label"}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>{lines === "through" ? "Frontage along the leg" : "Dividing lines refer to the leg"}</span>
          <select value={legAt} onChange={(e) => setLeg(Number(e.target.value))} className={inputClasses()}>
            {ring.map((p, k) => (
              <option key={k} value={k}>
                {p.pointId} to {ring[(k + 1) % ring.length]!.pointId}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Lines</span>
          <select
            value={lines}
            onChange={(e) => {
              const next = e.target.value as "square" | "parallel" | "through";
              setLines(next);
              if (next === "through" && by === "width") chooseBy("area");
            }}
            className={inputClasses()}
          >
            <option value="square">Square to it: shares side by side along it</option>
            <option value="parallel">Parallel to it: shares one behind another</option>
            <option value="through">Through one corner: shares fan out from it</option>
          </select>
        </label>
        {lines === "through" ? (
          <>
            <label className="grid gap-1.5">
              <span className={LABEL_CLASSES}>Lines pass through corner</span>
              <select value={cornerAt} onChange={(e) => setCorner(Number(e.target.value))} className={inputClasses()}>
                {ring.map((p, k) => (
                  <option key={k} value={k}>
                    {p.pointId}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className={LABEL_CLASSES}>First share goes towards</span>
              <select value={from} onChange={(e) => setFrom(e.target.value as "start" | "end")} className={inputClasses()}>
                <option value="start">Corner {pointAt(cornerAt + 1)}</option>
                <option value="end">Corner {pointAt(cornerAt - 1)}</option>
              </select>
            </label>
          </>
        ) : null}
        {lines === "square" ? (
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>First share starts at</span>
            <select value={from} onChange={(e) => setFrom(e.target.value as "start" | "end")} className={inputClasses()}>
              <option value="start">Corner {ring[legAt]?.pointId}</option>
              <option value="end">Corner {ring[(legAt + 1) % ring.length]?.pointId}</option>
            </select>
          </label>
        ) : null}
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-ink">Shares</legend>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-2">By</span>
          <select aria-label="Shares by" value={by} onChange={(e) => chooseBy(e.target.value as By)} className={inputClasses("w-auto")}>
            <option value="area">area</option>
            <option value="width" disabled={lines === "through"}>
              width
            </option>
          </select>
          <span className="text-sm text-ink-2">in</span>
          <select aria-label={by === "area" ? "Area unit" : "Width unit"} value={unit} onChange={(e) => (setUnit(e.target.value as Unit), setShares((s) => s.map(() => "")))} className={inputClasses("w-auto")}>
            {by === "area" ? (
              <>
                <option value="perch">perches</option>
                <option value="m2">square metres</option>
              </>
            ) : (
              <>
                <option value="m">metres</option>
                <option value="ft">feet</option>
              </>
            )}
          </select>
          {[2, 3, 4, 5].map((k) => (
            <button key={k} type="button" disabled={!total} onClick={() => equal(k)} className={buttonClasses("ghost", "sm")}>
              {k} equal
            </button>
          ))}
        </div>
        <ol className="grid gap-2">
          {shares.map((v, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <span className="w-16">Share {i + 1}</span>
                <input value={v} inputMode="decimal" placeholder="What's left" onChange={(e) => setShares((s) => s.map((x, j) => (j === i ? e.target.value.slice(0, 12) : x)))} className={inputClasses("w-36")} />
              </label>
              {shares.length > 2 ? (
                <button type="button" aria-label={`Remove share ${i + 1}`} onClick={() => setShares((s) => s.filter((_, j) => j !== i))} className={buttonClasses("ghost", "sm")}>
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={shares.length >= 50} onClick={() => setShares((s) => [...s, ""])} className={buttonClasses("secondary", "sm")}>
            Add a share
          </button>
        </div>
        <p className="text-sm text-ink-3">
          {lines === "through"
            ? `Each line runs from corner ${pointAt(cornerAt)} to the far side, cutting off the shares in order. `
            : by === "width"
            ? lines === "square"
              ? `Each width runs along the leg from corner ${ring[from === "start" ? legAt : (legAt + 1) % ring.length]?.pointId ?? ""}, in order. Where the lot reaches past the leg, the end shares take that part too. `
              : "Each width runs back from the leg, in order: a strip for an access road first, for example. "
            : ""}
          Leave one share empty for what&apos;s left.
        </p>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-ink">Minimums</legend>
        <label className="grid gap-1.5 sm:max-w-xl">
          <span className={LABEL_CLASSES}>Check each share against</span>
          <select value={ruleChoice} onChange={(e) => setRuleChoice(e.target.value as "none" | "uda" | "own")} className={inputClasses()}>
            <option value="none">No minimums</option>
            <option value="uda">
              UDA regulations: {UDA_2020.minimums.areaM2} m², {UDA_2020.minimums.frontageM} m frontage, {UDA_2020.minimums.depthM} m depth
            </option>
            <option value="own">Minimums I enter, from a Development Plan or other rule</option>
          </select>
        </label>
        {ruleChoice === "own" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["areaM2", "Least area (m²)"],
                ["frontageM", "Least frontage (m)"],
                ["depthM", "Least depth (m)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="grid gap-1.5">
                <span className={LABEL_CLASSES}>{label}</span>
                <input value={own[key]} inputMode="decimal" onChange={(e) => setOwn((o) => ({ ...o, [key]: e.target.value.slice(0, 12) }))} className={inputClasses()} />
              </label>
            ))}
            <label className="grid gap-1.5 sm:col-span-3">
              <span className={LABEL_CLASSES}>Where they come from</span>
              <input value={own.source} maxLength={200} placeholder="The Development Plan and zone, for example" onChange={(e) => setOwn((o) => ({ ...o, source: e.target.value }))} className={inputClasses()} />
            </label>
            {!ownReady ? <p className="text-sm text-ink-2 sm:col-span-3">Give all three minimums, using 0 for one that doesn&apos;t apply, and say where they come from.</p> : null}
          </div>
        ) : null}
        {ruleChoice === "uda" ? (
          <p className="text-sm text-ink-3">
            From the {UDA_2020.title}, regs. 9(a) and 14(1), for {UDA_2020.appliesTo}. {reviewNote(UDA_2020, new Date().toISOString().slice(0, 10))}
          </p>
        ) : null}
        {ruleChoice === "own" && rules ? <p className="text-sm text-ink-3">Your figures, from {rules.source}. Farbaek hasn&apos;t checked them against that source.</p> : null}
      </fieldset>

      {invalid ? <p className="text-sm text-failed">Write each share as a number.</p> : null}
      {result && !result.ok ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          {result.error}
        </p>
      ) : null}
      {result && result.ok ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Preview ring={ring} result={result} />
          <div className="grid content-start gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {result.feasible ? <StatusBadge status="done" label="Every share can be made" /> : <StatusBadge status="attention" label="Not every share can be made as asked" />}
              {result.bearing !== null ? <span className="text-sm text-ink-2">Lines at {formatDms(toDms(result.bearing, 0))} from grid north.</span> : null}
            </div>
            <div className="overflow-x-auto rounded-md ring-1 ring-line">
              <table className="w-full min-w-[30rem] text-left text-sm">
                <thead className="bg-canvas-2 text-ink-2">
                  <tr>
                    <th scope="col" className="p-2 font-medium">Share</th>
                    <th scope="col" className="p-2 text-right font-medium">Area</th>
                    <th scope="col" className="p-2 font-medium">Extent</th>
                    <th scope="col" className="p-2 text-right font-medium">Along the leg</th>
                    <th scope="col" className="p-2 text-right font-medium">Least depth</th>
                  </tr>
                </thead>
                <tbody>
                  {result.shares.map((s, i) => (
                    <tr key={i} className="border-t border-line align-top">
                      <td className="p-2 font-medium text-ink">
                        {i + 1}
                        {s.problems.map((p) => (
                          <span key={p} className="mt-1 block font-normal text-failed">
                            {p}
                          </span>
                        ))}
                      </td>
                      <td className="whitespace-nowrap p-2 text-right tabular">{shown(s.areaM2)}</td>
                      <td className="p-2 tabular">
                        {hectares(s.areaM2)} ha, {arpClassic(toArp(s.areaM2, perchDecimals))}
                      </td>
                      <td className="whitespace-nowrap p-2 text-right tabular">{fmt(s.alongLegM, 2)} m</td>
                      <td className="whitespace-nowrap p-2 text-right tabular">{fmt(s.depthM, 2)} m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-ink-2">
              The lot is <span className="tabular font-medium text-ink">{shown(result.lotM2)}</span>; the shares come to <span className="tabular font-medium text-ink">{shown(result.sumM2)}</span>, leaving{" "}
              <span className="tabular font-medium text-ink">{fmt(Math.abs(result.residualM2), 4)} m²</span> by rounding.
            </p>
            <div className="grid gap-2">
              <h3 className="text-sm font-medium text-ink">Setting out the new corners</h3>
              {result.rays ? (
                <ul className="grid gap-1 text-sm text-ink-2">
                  {result.rays.map((r) => (
                    <li key={r.to}>
                      The line from corner {r.from} to <span className="font-medium text-ink">{r.to}</span> runs at <span className="tabular">{formatDms(toDms(r.bearing, 0))}</span> for <span className="tabular">{fmt(r.lengthM, 3)} m</span>.
                    </li>
                  ))}
                </ul>
              ) : null}
              <ul className="grid gap-1 text-sm text-ink-2">
                {result.corners.map((c) =>
                  c.existing ? (
                    <li key={`${c.cut}-${c.name}`}>A dividing line ends at corner {c.name}, already pegged.</li>
                  ) : (
                    <li key={c.name}>
                      <span className="font-medium text-ink">{c.name}</span>: {fmt(c.distanceM, 3)} m from corner {c.from.pointId} towards {c.to.pointId} <span className="font-mono text-xs text-ink-3">E {fmt(c.e, 3)} N {fmt(c.n, 3)}</span>
                    </li>
                  ),
                )}
              </ul>
              <button type="button" onClick={download} className={buttonClasses("secondary", "sm", "w-fit")}>
                <DownloadSimpleIcon size={16} weight="bold" aria-hidden />
                Setting-out table as CSV
              </button>
            </div>
            {result.reminders.length > 0 ? (
              <div className="grid gap-2">
                <h3 className="text-sm font-medium text-ink">Before going ahead</h3>
                <ul className="grid list-disc gap-1 pl-5 text-sm text-ink-2">
                  {result.reminders.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-sm text-ink-3">
              Not part of the plan yet. Peg the new corners, observe and import them, then draw the shares as lots on this step. Worked out by {result.engine} from the surveyed corners; nothing is moved.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The lot with its new dividing lines, north up. */
function Preview({ ring, result }: { ring: SurveyPoint[]; result: Extract<ReturnType<typeof partitionLot>, { ok: true }> }) {
  const es = ring.map((p) => p.e);
  const ns = ring.map((p) => p.n);
  const [minE, maxE, minN, maxN] = [Math.min(...es), Math.max(...es), Math.min(...ns), Math.max(...ns)];
  const w = Math.max(maxE - minE, 1e-6);
  const h = Math.max(maxN - minN, 1e-6);
  const pad = Math.max(w, h) * 0.08;
  const x = (e: number) => e - minE + pad;
  const y = (n: number) => maxN - n + pad;
  const cuts = result.segments;
  const centre = (cs: { e: number; n: number }[]) => ({ e: cs.reduce((s, c) => s + c.e, 0) / cs.length, n: cs.reduce((s, c) => s + c.n, 0) / cs.length });
  const stroke = Math.max(w, h) / 250;
  return (
    <svg viewBox={`0 0 ${w + 2 * pad} ${h + 2 * pad}`} role="img" aria-label="The lot with its new dividing lines" className="h-auto w-full rounded-md bg-surface ring-1 ring-line">
      <polygon points={ring.map((p) => `${x(p.e)},${y(p.n)}`).join(" ")} fill="none" stroke="var(--color-ink)" strokeWidth={stroke * 1.4} />
      {cuts.map((c, i) => (
        <line key={i} x1={x(c.a.e)} y1={y(c.a.n)} x2={x(c.b.e)} y2={y(c.b.n)} stroke="var(--color-accent)" strokeWidth={stroke} strokeDasharray={`${stroke * 4} ${stroke * 3}`} />
      ))}
      {result.shares.map((s, i) => {
        const c = centre(s.corners);
        return (
          <text key={i} x={x(c.e)} y={y(c.n)} fontSize={Math.max(w, h) / 22} textAnchor="middle" dominantBaseline="middle" fill="var(--color-ink-2)">
            {i + 1}
          </text>
        );
      })}
      {ring.map((p) => (
        <text key={p.id} x={x(p.e)} y={y(p.n)} dx={stroke * 3} dy={-stroke * 3} fontSize={Math.max(w, h) / 32} fill="var(--color-ink-3)">
          {p.pointId}
        </text>
      ))}
      {result.corners.map((c) => (
        <text key={c.name} x={x(c.e)} y={y(c.n)} dx={stroke * 3} dy={stroke * 6} fontSize={Math.max(w, h) / 32} fill="var(--color-accent)">
          {c.name}
        </text>
      ))}
    </svg>
  );
}
