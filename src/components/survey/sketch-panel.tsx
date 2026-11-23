"use client";

import { CameraIcon, CircleNotchIcon, ScribbleIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { readSketchesAction, type SketchReadState } from "@/app/app/survey/ai-actions";
import { SKETCH_LIMITS, readerName, type ReadingCheck, type ReadingStatus, type SketchRecord } from "@/core/survey/autosurvey/sketch";
import { Card, CardTitle } from "@/components/app/primitives";
import { buttonClasses } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { LocalTime } from "@/components/ui/local-time";
import { StatusGlyph } from "@/components/ui/status-badge";
import { shrink } from "./photo";

const STATUS: Record<ReadingStatus, { glyph: "done" | "info" | "attention" | "off"; label: string }> = {
  agrees: { glyph: "done", label: "Agrees" },
  close: { glyph: "info", label: "Within measuring difference" },
  differs: { glyph: "attention", label: "Differs" },
  unmatched: { glyph: "attention", label: "Not in the data" },
  not_checked: { glyph: "off", label: "Not compared" },
};

const where = (c: ReadingCheck) => (c.reading.from && c.reading.to ? `between ${c.reading.from} and ${c.reading.to}` : c.reading.near ? `near ${c.reading.near}` : "");

/**
 * The Draft step's field sketches (stage 223, ADR 0234): what Claude read from them, each reading as written with how it compares
 * with the coordinates, and a way to read sketches (again). New readings replace the earlier ones. Differences that need the
 * surveyor are in the plan's checks, where they're answered.
 */
export function SketchPanel(props: {
  projectId: string;
  baseVersion: number;
  sketch: SketchRecord | null;
  /** Each reading checked against the coordinates, or null when the coordinate system isn't confirmed. */
  checks: ReadingCheck[] | null;
  /** Why reading sketches is off here, or null when it works. */
  readOff: string | null;
  aiCost: string;
  /** The photos this reading came from, kept with the plan (ADR 0240); empty when they weren't kept. */
  photos?: { id: string; fileName: string }[];
}) {
  const router = useRouter();
  const [photos, setPhotos] = useState<{ key: string; name: string; blob: Blob }[]>([]);
  const [consent, setConsent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<SketchReadState>({ status: "idle" });
  const [preparing, setPreparing] = useState(false);
  const [pending, startTransition] = useTransition();
  const picker = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const { sketch, checks } = props;
  const kept = props.photos ?? [];
  const photoOf = (file: string) => {
    const ph = kept.find((x) => x.fileName === file);
    return ph ? `/app/survey/${props.projectId}/sketch-photo/${ph.id}` : null;
  };

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProblem(null);
    setResult({ status: "idle" });
    setPreparing(true);
    const added: typeof photos = [];
    for (const file of Array.from(files)) {
      const blob = await shrink(file).catch(() => null);
      if (!blob || blob.size > SKETCH_LIMITS.photoBytes) {
        setProblem(`${file.name} couldn't be opened here, or is too large. Save it as a JPEG or PNG and add it again.`);
        continue;
      }
      counter.current += 1;
      added.push({ key: `${counter.current}`, name: file.name, blob });
    }
    setPreparing(false);
    if (photos.length + added.length > SKETCH_LIMITS.photos) setProblem(`Farbaek reads up to ${SKETCH_LIMITS.photos} sketches at a time, so only the first ${SKETCH_LIMITS.photos} are kept.`);
    setPhotos((now) => [...now, ...added].slice(0, SKETCH_LIMITS.photos));
  };

  const bytes = photos.reduce((s, p) => s + p.blob.size, 0);
  const off =
    props.readOff ??
    (photos.length === 0
      ? "Choose photos of your field sketches first."
      : bytes > SKETCH_LIMITS.totalBytes
        ? "These photos are too large together. Remove one."
        : !consent
          ? "Tick the box to send the photos to Anthropic for reading."
          : null);

  const read = () => {
    if (off) return;
    const form = new FormData();
    form.set("projectId", props.projectId);
    form.set("baseVersion", String(props.baseVersion));
    form.set("consent", "yes");
    for (const p of photos) form.append("photo", p.blob, p.name);
    startTransition(async () => {
      const r = await readSketchesAction(form).catch((): SketchReadState => ({ status: "error", message: "The connection dropped while the sketches were sent. Try again." }));
      setResult(r);
      if (r.status === "done") {
        setPhotos([]);
        setConsent(false);
        router.refresh();
      }
    });
  };

  const count = (s: ReadingStatus) => checks?.filter((c) => c.status === s).length ?? 0;
  const [agrees, close, differs] = [count("agrees"), count("close"), count("differs")];
  const compared = [
    `${agrees} ${agrees === 1 ? "agrees" : "agree"} with the coordinates`,
    ...(close > 0 ? [`${close} ${close === 1 ? "is" : "are"} within the usual measuring difference`] : []),
    ...(differs > 0 ? [`${differs} ${differs === 1 ? "differs" : "differ"}: the plan's checks ask you about ${differs === 1 ? "it" : "them"}`] : []),
  ];

  return (
    <Card>
      <CardTitle icon={ScribbleIcon}>Field sketches</CardTitle>
      {sketch && sketch.readings.length > 0 ? (
        <div className="mt-1 grid gap-3">
          <p className="text-sm text-ink-2">
            {readerName(sketch.model)} read {sketch.readings.length} {sketch.readings.length === 1 ? "thing" : "things"} from {sketch.files.length} {sketch.files.length === 1 ? "sketch" : "sketches"} on <LocalTime iso={sketch.readAt} date />, each kept as written.{" "}
            {checks
              ? `${compared.length > 1 ? `${compared.slice(0, -1).join(", ")} and ${compared.at(-1)}` : compared[0]}.`
              : "Confirm the project's coordinate system to compare them with the coordinates."}
          </p>
          {kept.length > 0 ? (
            <ul aria-label="The photos read" className="flex flex-wrap gap-2">
              {kept.map((ph) => (
                <li key={ph.id}>
                  <a href={`/app/survey/${props.projectId}/sketch-photo/${ph.id}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-sm ring-1 ring-line hover:ring-line-strong">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a private photo from Farbaek's own route, read with the person's session */}
                    <img src={`/app/survey/${props.projectId}/sketch-photo/${ph.id}`} alt={`Sketch photo ${ph.fileName}`} loading="lazy" className="h-24 w-auto max-w-[10rem] object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <Disclosure summary="What was read" hint="Every reading as written, and how it compares with the coordinates.">
            <ul className="grid gap-2.5">
              {(checks ?? sketch.readings.map((reading): ReadingCheck => ({ reading, status: "not_checked", detail: "" }))).map((c) => (
                <li key={c.reading.id} className="flex items-start gap-2.5 text-sm">
                  <StatusGlyph status={STATUS[c.status].glyph} className="mt-0.5" />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="text-ink">
                      <span className="font-medium">{c.reading.text}</span> {where(c)} <span className="text-ink-3">({STATUS[c.status].label.toLowerCase()})</span>
                    </span>
                    {c.detail && c.status !== "agrees" ? <span className="text-ink-2">{c.detail}</span> : null}
                    {photoOf(c.reading.file) ? (
                      <a href={photoOf(c.reading.file)!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center truncate text-accent underline-offset-2 hover:underline">
                        {c.reading.file}
                      </a>
                    ) : (
                      <span className="truncate text-ink-3">{c.reading.file}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {sketch.unreadable.length > 0 ? <p className="mt-3 text-sm text-ink-2">Couldn&apos;t be read for certain: {sketch.unreadable.join("; ")}.</p> : null}
          </Disclosure>
        </div>
      ) : (
        <p className="mt-1 text-sm text-ink-2">
          Add photos of your field sketches, and Claude writes down the point numbers, distances, bearings and names on them, as written. Farbaek compares every measurement with your survey data, and the plan&apos;s checks show what differs. Nothing is drawn or moved from a sketch.
        </p>
      )}

      <div className="mt-4 grid gap-3">
        {photos.length > 0 ? (
          <ul aria-label="Sketch photos to read" className="grid gap-1.5">
            {photos.map((p) => (
              <li key={p.key} className="flex items-center gap-2 text-sm text-ink">
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <button type="button" onClick={() => setPhotos((now) => now.filter((x) => x.key !== p.key))} aria-label={`Remove ${p.name}`} className="tap inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-canvas-2 hover:text-ink">
                  <XIcon size={16} weight="bold" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {photos.length > 0 ? (
          <label className="flex min-h-11 items-start gap-3 rounded-sm border border-line bg-canvas-2 p-3 text-sm text-ink">
            <input type="checkbox" checked={consent} disabled={pending} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
            <span>
              Send {photos.length === 1 ? "this photo" : `these ${photos.length} photos`} to Anthropic, outside Sri Lanka, for Claude to read. When something is read, Farbaek keeps them with this plan, beside their readings, until they&apos;re read again or the workspace is deleted. {props.aiCost}
            </span>
          </label>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" onClick={() => picker.current?.click()} disabled={Boolean(props.readOff) || pending || preparing || photos.length >= SKETCH_LIMITS.photos} className={buttonClasses("secondary", "md")}>
            {preparing ? <CircleNotchIcon size={16} weight="bold" className="motion-safe:animate-spin" aria-hidden /> : <CameraIcon size={16} weight="bold" aria-hidden />}
            {preparing ? "Preparing the photos" : photos.length === 0 ? "Choose sketch photos" : "Add a photo"}
          </button>
          {photos.length > 0 ? (
            <button type="button" onClick={read} disabled={Boolean(off) || pending} className={buttonClasses("primary", "md")}>
              {pending ? "Reading the sketches…" : sketch ? "Read and replace" : "Read the sketches"}
            </button>
          ) : null}
          <input ref={picker} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void add(e.target.files).then(() => (e.target.value = ""))} />
        </div>
        <p aria-live="polite" className="text-sm text-ink-3">
          {pending ? "Claude is reading what's written on them, which can take a minute." : (off ?? (sketch ? "New readings replace the ones above, and any answers you gave about them." : `Up to ${SKETCH_LIMITS.photos} photos.`))}
        </p>
        {problem ? (
          <p className="flex items-start gap-2 text-sm text-ink">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
            {problem}
          </p>
        ) : null}
        {result.status === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-sm font-medium text-ink">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
            {result.message}
          </p>
        ) : result.status === "done" ? (
          <p role="status" className="text-sm text-ink-2">
            {result.message}
            {result.unreadable > 0 ? ` ${result.unreadable} ${result.unreadable === 1 ? "thing" : "things"} couldn't be read for certain.` : ""}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
