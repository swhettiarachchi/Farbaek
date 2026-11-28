"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ListIcon, MapTrifoldIcon } from "@/components/icons";
import { CardTitle } from "@/components/app/primitives";
import { Disclosure } from "@/components/ui/disclosure";
import type { JobFacts } from "@/core/survey/autosurvey/job-facts";
import type { CodeEntry } from "@/core/survey/codes";
import type { ImportedPoint } from "@/core/survey/import/delimited";
import { LABELLED_POINTS, barWords, layoutPreview } from "./preview-layout";
import { PointsTable } from "./points-table";

const NO_CODES: readonly CodeEntry[] = [];
const metres = (m: number) => (m >= 100 ? `${Math.round(m)} m` : `${m.toFixed(1)} m`);
const andList = (items: readonly string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/**
 * What the files hold, before anything is saved (stage 293): every point once, drawn north up at one scale with its number, the
 * stations marked, and what the files say about the job, so the surveyor sees at a glance that it's the right survey. The full
 * list of points folds under it.
 */
export function StartPreview({
  points,
  facts,
  codes,
  files,
  sketch,
}: {
  points: readonly ImportedPoint[];
  facts: JobFacts;
  /** The code list the plan will be drawn with, or null when it isn't known here (the surveyor's carried list, the Survey Department's). */
  codes: readonly CodeEntry[] | null;
  files: number;
  /** Whether a sketch will be read for the lines: read, waiting for the box to be ticked, not readable here, or none added. */
  sketch: "read" | "tick" | "off" | "none";
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // The observer reports the box's width as soon as it starts watching, and again whenever it changes.
    const observer = new ResizeObserver(() => setWidth(Math.floor(el.getBoundingClientRect().width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const stations = useMemo(() => new Set(facts.stations.filter((s) => points.some((p) => p.pointId === s))), [facts.stations, points]);
  const layout = useMemo(() => layoutPreview(points.map((p) => ({ id: p.pointId, e: p.e, n: p.n })), stations, width), [points, stations, width]);

  const codesKnown = points.some((p) => (p.code ?? "").trim() !== "");
  const heights = points.some((p) => p.z !== null && p.z !== 0);
  const across = Math.max(...points.map((p) => p.e)) - Math.min(...points.map((p) => p.e));
  const along = Math.max(...points.map((p) => p.n)) - Math.min(...points.map((p) => p.n));
  const stationList = [...stations];
  const lines: string[] = [];
  lines.push(`${points.length} ${points.length === 1 ? "point" : "points"}${files > 1 ? ` from ${files} files, each counted once` : ""}${across > 0 || along > 0 ? `, spread over ${metres(across)} east to west and ${metres(along)} north to south` : ""}.`);
  if (stationList.length > 0) lines.push(`Set up at ${stationList.length === 1 ? "station" : "stations"} ${andList(stationList.slice(0, 8))}${stationList.length > 8 ? " and more" : ""}, marked with a triangle.`);
  // The printout's project in full, else the instrument's short job name.
  const name = facts.project ?? facts.job;
  if (name || facts.instrument) {
    const job = name ? `Job ${name}` : "";
    const by = facts.instrument ? `${job ? ", measured" : "Measured"} with ${facts.instrument}${facts.serial ? ` (serial ${facts.serial})` : ""}` : "";
    const sf = facts.scaleFactor ? ` Scale factor ${facts.scaleFactor}, as recorded.` : "";
    lines.push(`${job}${by}.${sf}`);
  }
  const fromSketch = {
    read: "Farbaek takes the lines from your sketch.",
    tick: "Tick the box below to have them read from your sketch, or draw them on the plan.",
    off: "Your sketch can't be read here, so draw them on the plan.",
    none: "Add a photo of your field sketch to have them read from it, or draw them on the plan.",
  }[sketch];
  if (!codesKnown) lines.push(`${heights ? "No codes" : "No codes and no heights"} in the files, so no lines are drawn from codes. ${fromSketch}`);
  else if (!heights) lines.push("No heights in the files: every height is 0 or missing.");

  return (
    <section aria-labelledby="start-preview" className="grid gap-4 rounded-md border border-line bg-surface p-4 shadow-e1 sm:p-5">
      <CardTitle id="start-preview" icon={MapTrifoldIcon}>
        What&apos;s in your files
      </CardTitle>
      <ul className="grid gap-1 text-sm text-ink-2">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      <figure className="grid gap-2">
        <div ref={box} className="overflow-hidden rounded-md bg-canvas-2 ring-1 ring-line">
          {layout ? (
            <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={`The ${points.length} points, north up${stationList.length ? `, with ${stationList.length === 1 ? "station" : "stations"} ${andList(stationList.slice(0, 8))}` : ""}`} className="block max-w-full">
              {layout.dots.map((d) =>
                d.station ? (
                  <path key={d.id} d={`M${d.x} ${d.y - 6} L${d.x + 5.5} ${d.y + 4} L${d.x - 5.5} ${d.y + 4} Z`} fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth={1.6} strokeLinejoin="round" />
                ) : (
                  <circle key={d.id} cx={d.x} cy={d.y} r={2.75} fill="var(--color-ink-2)" />
                ),
              )}
              {layout.labels.map((l) => (
                <text key={l.id} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={12} fill={stations.has(l.id) ? "var(--color-ink)" : "var(--color-ink-3)"} className="tabular">
                  {l.id}
                </text>
              ))}
              {/* Grid north, at the top right. */}
              <g aria-hidden transform={`translate(${layout.north.x} ${layout.north.y})`}>
                <path d="M0 0 L5 12 L0 9 L-5 12 Z" fill="var(--color-ink-2)" />
                <text x={0} y={26} textAnchor="middle" fontSize={12} fill="var(--color-ink-2)">
                  N
                </text>
              </g>
              {layout.bar ? (
                <g aria-hidden transform={`translate(${layout.bar.x} ${layout.bar.y})`}>
                  <path d={`M0 -4 L0 0 L${layout.bar.pixels} 0 L${layout.bar.pixels} -4`} fill="none" stroke="var(--color-ink-2)" strokeWidth={1.5} />
                  <text x={layout.bar.pixels + 6} y={4} fontSize={12} fill="var(--color-ink-2)">
                    {barWords(layout.bar.metres)}
                  </text>
                </g>
              ) : null}
            </svg>
          ) : (
            <div className="h-56" />
          )}
        </div>
        <figcaption className="text-sm text-ink-3">
          The points as read, north up on the coordinates&apos; own grid. Nothing is joined yet.
          {layout && layout.hidden > 0 ? ` ${points.length > LABELLED_POINTS ? "Numbers are left off: there are too many points to show them." : `${layout.hidden} ${layout.hidden === 1 ? "number is" : "numbers are"} left off where points crowd.`} Every point is in the list below.` : ""}
        </figcaption>
      </figure>
      <Disclosure summary="Every point" hint={`${points.length} ${points.length === 1 ? "point" : "points"}, with coordinates and codes`} icon={<ListIcon size={20} weight="bold" className="size-4 text-ink-3 sm:size-5" aria-hidden />}>
        <PointsTable points={points} issues={[]} codes={codes ?? NO_CODES} judge={codes !== null} />
      </Disclosure>
    </section>
  );
}
