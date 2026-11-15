"use client";

import { CameraIcon, CheckCircleIcon, CircleNotchIcon, FloppyDiskIcon, PenNibIcon, QuestionIcon, TrashIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { applyReview, itemsInReview, rawTokens, type AcceptedItem } from "@/core/survey/ai-draft";
import { lotName, type SurveyDocument } from "@/core/survey/document";
import type { SurveyPoint } from "@/core/survey/parcel";
import { buildPlan } from "@/core/survey/view";
import { draftSurveyPlanAction, readOldPlanAction, type SurveyDraftState } from "@/app/app/survey/ai-actions";
import { saveSurveyDrawingAction } from "@/app/app/survey/actions";
import { Card, CardTitle } from "@/components/app/primitives";
import { ReportResult } from "@/components/tasks/report-result";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, textareaClasses } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { SheetSvg } from "./sheet-svg";

const BRIEF_MAX = 4_000;
const PHOTO_MAX = 3;
/** Claude reads images up to about this long side; larger ones are scaled down anyway, so they're shrunk here first. */
const PHOTO_SIDE = 1_568;

export interface DraftPanelProps {
  projectId: string;
  baseVersion: number;
  document: SurveyDocument;
  points: SurveyPoint[];
  crsId: string;
  crsConfirmation: string | null;
  /** Why drafting from a description is off, or null when it works. */
  draftOff: string | null;
  /** Why reading a photo is off, or null when it works. */
  readOff: string | null;
  /** The AI provider's name for the consent line, such as "Claude". */
  provider: string | null;
}

type Done = Extract<SurveyDraftState, { status: "done" }>;
interface Photo {
  name: string;
  blob: Blob;
  url: string;
}

/** A photo shrunk in the browser to what the model reads, as JPEG: smaller to send, and its original never leaves the device. */
async function shrink(file: File): Promise<Blob> {
  // A large photo (a 50 MP phone camera) is decoded straight to a smaller width where the browser can, so it doesn't fill a phone's memory.
  const big = file.size > 4_000_000;
  const bitmap = await createImageBitmap(file, big ? { imageOrientation: "from-image", resizeWidth: 2 * PHOTO_SIDE, resizeQuality: "high" } : { imageOrientation: "from-image" }).catch(() => createImageBitmap(file, { imageOrientation: "from-image" }));
  const scale = Math.min(1, PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85));
}

const KIND_ORDER = ["lot", "road", "adjoining", "sheet", "notes"] as const;
const KIND_TITLES: Record<(typeof KIND_ORDER)[number], string> = { lot: "Lots", road: "Roads", adjoining: "Adjoining lands", sheet: "Title and boundaries", notes: "Notes" };
const kindOf = (key: string): (typeof KIND_ORDER)[number] => (key.startsWith("lot:") ? "lot" : key.startsWith("road:") ? "road" : key.startsWith("adjoining:") ? "adjoining" : key === "notes" ? "notes" : "sheet");
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function DraftPanel(props: DraftPanelProps) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [shrinking, setShrinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Done | null>(null);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set());
  const [running, startRunning] = useTransition();
  const [saving, startSaving] = useTransition();
  const [which, setWhich] = useState<"draft" | "read" | null>(null);

  // Object URLs of the photo previews, released when the panel goes away.
  const urls = useRef<string[]>([]);
  useEffect(() => {
    const list = urls.current;
    return () => list.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  // The point numbers the description names, as it's typed. A number beside them that isn't a point is probably a typo.
  const named = useMemo(() => {
    const known = new Set(props.points.map((p) => p.pointId.toLowerCase()));
    const tokens = rawTokens(brief);
    const isKnown = (t: string | undefined) => t !== undefined && known.has(t.toLowerCase());
    const found = new Set(tokens.filter((t) => isKnown(t)).map((t) => t.toLowerCase()));
    const unknown = [...new Set(tokens.filter((t, i) => /^\d+[a-z]?$/i.test(t) && !isKnown(t) && (isKnown(tokens[i - 1]) || isKnown(tokens[i + 1]))))].slice(0, 6);
    return { known: found.size, unknown };
  }, [brief, props.points]);

  const review = useMemo(() => ({ removed, confirmed }), [removed, confirmed]);
  const proposal = useMemo(() => (result ? applyReview(props.document, result, review) : null), [result, props.document, review]);
  const preview = useMemo(() => (proposal ? buildPlan({ points: props.points, document: proposal, crsId: props.crsId, crsConfirmation: props.crsConfirmation, surveyor: null, approval: null }) : null), [proposal, props.points, props.crsId, props.crsConfirmation]);

  const take = (r: SurveyDraftState) => {
    if (r.status === "error") return setError(r.message);
    if (r.status !== "done") return;
    setResult(r);
    setRemoved(new Set());
    setConfirmed(new Set());
    setError(null);
  };

  const draft = () => {
    setWhich("draft");
    setError(null);
    startRunning(async () => take(await draftSurveyPlanAction({ projectId: props.projectId, baseVersion: props.baseVersion, brief })));
  };

  const read = () => {
    setWhich("read");
    setError(null);
    startRunning(async () => {
      const form = new FormData();
      form.set("projectId", props.projectId);
      form.set("baseVersion", String(props.baseVersion));
      photos.forEach((p, i) => form.append("photo", new File([p.blob], `photo-${i + 1}.jpg`, { type: "image/jpeg" })));
      take(await readOldPlanAction(form));
    });
  };

  const choose = async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    const room = PHOTO_MAX - photos.length;
    if (files.length > room) setError(`Up to ${PHOTO_MAX} photos at a time.`);
    // The picker stays off while these are shrunk, so a second pick can't pass the limit.
    setShrinking(true);
    const added: Photo[] = [];
    for (const f of files.slice(0, room)) {
      try {
        const blob = await shrink(f);
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        added.push({ name: f.name, blob, url });
      } catch {
        setError(`Farbaek couldn't open ${f.name}. Use a JPEG or PNG photo or scan.`);
      }
    }
    setPhotos((p) => [...p, ...added].slice(0, PHOTO_MAX));
    setShrinking(false);
  };

  const removePhoto = (i: number) =>
    setPhotos((p) => {
      URL.revokeObjectURL(p[i]!.url);
      return p.filter((_, j) => j !== i);
    });

  const save = () => {
    if (!proposal || !result) return;
    startSaving(async () => {
      const note = result.source === "ai_brief" ? "Drafted from your description" : "Title read from a photo";
      const r = await saveSurveyDrawingAction({ projectId: props.projectId, baseVersion: result.baseVersion, document: proposal, note });
      if (r.status === "error") return setError(r.message);
      router.push(`/app/survey/${props.projectId}?step=plan`);
      router.refresh();
    });
  };

  const discard = () => {
    setResult(null);
    setRemoved(new Set());
    setConfirmed(new Set());
  };

  if (result && proposal) {
    const items = itemsInReview(result, proposal, review);
    const groups = KIND_ORDER.map((k) => ({ kind: k, items: items.filter((a) => kindOf(a.key) === k) })).filter((g) => g.items.length > 0);
    const drafted = (prefix: string) => new Set(result.accepted.filter((a) => a.key.startsWith(prefix)).map((a) => a.key.slice(prefix.length)));
    const draftedLots = drafted("lot:");
    const draftedRoads = drafted("road:");
    const draftedAdjoining = drafted("adjoining:");
    const replaces = [
      proposal.lots.some((l) => draftedLots.has(l.id)) && props.document.lots.length > 0 ? count(props.document.lots.length, "lot", "lots") : null,
      proposal.roads.some((r) => draftedRoads.has(r.id)) && props.document.roads.length > 0 ? count(props.document.roads.length, "road", "roads") : null,
      proposal.adjoining.some((a) => draftedAdjoining.has(a.id)) && props.document.adjoining.length > 0 ? count(props.document.adjoining.length, "adjoining land", "adjoining lands") : null,
    ].filter(Boolean);
    const page = preview?.sheet.pages[0];
    const row = (a: AcceptedItem) => {
      const checked = proposal.provenance[a.key]?.reviewed === true;
      return (
        <li key={a.key} className="grid gap-2 rounded-sm bg-canvas-2 p-3 ring-1 ring-line sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <span className="min-w-0 break-words text-sm text-ink">{a.label}</span>
          <span className="flex flex-wrap items-center gap-2">
            {checked ? (
              <StatusBadge status="done" label="Checked" />
            ) : (
              <button type="button" onClick={() => setConfirmed((s) => new Set(s).add(a.key))} className={buttonClasses("secondary", "sm")}>
                <CheckCircleIcon size={16} weight="bold" aria-hidden />
                Looks right
              </button>
            )}
            <button type="button" aria-label={`Take out ${a.label}`} onClick={() => setRemoved((s) => new Set(s).add(a.key))} className={buttonClasses("ghost", "sm", "size-11 px-0")}>
              <TrashIcon size={16} weight="bold" aria-hidden />
            </button>
          </span>
        </li>
      );
    };
    return (
      <Card>
        <CardTitle icon={CheckCircleIcon}>Check the draft</CardTitle>
        <p className="mt-1 text-sm text-ink-2">
          {result.source === "ai_brief" ? "Read from your description." : "Read from your photos."} Every area, extent and width on the sheet is computed from your points, not by the AI. Mark each item as right, take out what isn&apos;t, then save it as a new version. You can change anything afterwards on the Lots and Plan steps.
        </p>
        {replaces.length > 0 ? <p className="mt-3 text-sm text-ink">The draft replaces the plan&apos;s {replaces.length > 1 ? `${replaces.slice(0, -1).join(", ")} and ${replaces[replaces.length - 1]}` : replaces[0]}. Take out every drafted one of a kind to keep the plan&apos;s own.</p> : null}

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="grid content-start gap-5">
            {groups.length === 0 ? <p className="text-sm text-ink-2">Nothing from the draft is left. Discard it, or draft again.</p> : null}
            {groups.map((g) => (
              <section key={g.kind} aria-label={KIND_TITLES[g.kind]} className="grid gap-2">
                <h3 className="text-sm font-medium text-ink">{KIND_TITLES[g.kind]}</h3>
                <ul className="grid gap-2">{g.items.map(row)}</ul>
              </section>
            ))}

            {result.questions.length > 0 ? (
              <section aria-label="What the draft still needs" className="grid gap-2">
                <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
                  <QuestionIcon size={16} weight="bold" className="text-ink-3" aria-hidden /> What the draft still needs
                </h3>
                <ul className="grid list-disc gap-1 pl-5 text-sm text-ink-2">
                  {result.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
                <p className="text-sm text-ink-3">Fill these in on the Plan step, or add them to your description and draft again.</p>
              </section>
            ) : null}

            {result.dropped.length > 0 ? (
              <section aria-label="Left out" className="grid gap-2">
                <h3 className="text-sm font-medium text-ink">Left out</h3>
                <ul className="grid gap-1.5 text-sm text-ink-2">
                  {result.dropped.map((d, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
                      <span>
                        <span className="text-ink">{d.what}.</span> {d.why}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <div className="grid content-start gap-2">
            {page ? (
              <div className="aspect-[1/1.414] w-full overflow-hidden rounded-md bg-surface ring-1 ring-line">
                <SheetSvg page={page} label="The drafted plan sheet" className="h-full w-full" />
              </div>
            ) : null}
            <p className="text-sm text-ink-3">The sheet as it would print. Checks that stop export are on the Check step after you save.</p>
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <button type="button" onClick={save} disabled={saving || groups.length === 0} className={buttonClasses("primary", "md")}>
            {saving ? <CircleNotchIcon size={16} weight="bold" className="motion-safe:animate-spin" aria-hidden /> : <FloppyDiskIcon size={16} weight="bold" aria-hidden />}
            Save as version {result.baseVersion + 1}
          </button>
          <button type="button" onClick={discard} disabled={saving} className={buttonClasses("ghost", "md")}>
            <XIcon size={16} weight="bold" aria-hidden />
            Discard the draft
          </button>
          <ReportResult about={{ surveyProjectId: props.projectId }} className="ml-auto" />
        </div>
      </Card>
    );
  }

  const pickerOff = photos.length >= PHOTO_MAX || running || shrinking || props.readOff !== null;
  return (
    <div className="grid gap-6">
      <Card>
        <CardTitle icon={PenNibIcon}>Describe the job</CardTitle>
        <p className="mt-1 text-sm text-ink-2">
          Write it as you&apos;d brief someone drawing it for you: each lot and its corner points in order, roads and the points along their edges, what adjoins between which points, the land&apos;s name and where it is, the earlier plan and the dates. Farbaek reads it into the plan and
          computes every area, extent and width from your points. Nothing you didn&apos;t write is added, and each item waits for you to check it.
        </p>
        <label className="mt-4 grid gap-1.5">
          <span className={LABEL_CLASSES}>Your description</span>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value.slice(0, BRIEF_MAX))}
            rows={8}
            maxLength={BRIEF_MAX}
            disabled={running || props.draftOff !== null}
            placeholder={"Sub division of lot B depicted in Plan No. 1234 dated 01.02.2003.\nLot B1 is points 1 2 3 8 7. Lot B2 is points 7 8 5 6.\nA road along points 9 10 and 11 12, from Main Road.\nBetween points 6 and 7 is the land claimed by the neighbour."}
            className={textareaClasses()}
          />
          <span className="text-sm text-ink-3">
            {named.known === 0 ? "Name the corner points by their numbers." : `Names ${named.known === 1 ? "one of your points" : `${named.known} of your points`}.`}
            {named.unknown.length > 0 ? ` Not in this project: ${named.unknown.join(", ")}.` : ""} {brief.length > BRIEF_MAX - 400 ? `${BRIEF_MAX - brief.length} characters left.` : ""}
          </span>
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={draft} disabled={running || props.draftOff !== null || brief.trim().length < 20} className={buttonClasses("primary", "md")}>
            {running && which === "draft" ? <CircleNotchIcon size={16} weight="bold" className="motion-safe:animate-spin" aria-hidden /> : <PenNibIcon size={16} weight="bold" aria-hidden />}
            {running && which === "draft" ? "Drafting the plan" : "Draft the plan"}
          </button>
          <span className="text-sm text-ink-3">{props.draftOff ?? "Uses AI usage. If it fails, it isn't counted."}</span>
        </div>
      </Card>

      <Card>
        <CardTitle icon={CameraIcon}>Read an old plan</CardTitle>
        <p className="mt-1 text-sm text-ink-2">
          Photograph or scan the earlier plan or the deed. Farbaek reads its title, the earlier plan&apos;s number, date and surveyor, the location, what bounds the land and the extent as stated. It never takes points, measurements or notes from a photo: those come from your survey. Lay the sheet
          flat in even light and photograph the title and the boundaries close up.
        </p>
        <div className="mt-4 grid gap-3">
          {photos.length > 0 ? (
            <ul className="flex flex-wrap gap-3">
              {photos.map((p, i) => (
                <li key={p.url} className="grid w-28 gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of a photo that's never uploaded as-is */}
                  <img src={p.url} alt={`Photo ${i + 1}, ${p.name}`} className="aspect-square w-28 rounded-sm object-cover ring-1 ring-line" />
                  <button type="button" onClick={() => removePhoto(i)} disabled={running} className={buttonClasses("ghost", "sm")}>
                    <TrashIcon size={16} weight="bold" aria-hidden />
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <label className={`${buttonClasses("secondary", "md")} w-fit has-focus-visible:outline-2 has-focus-visible:outline-accent ${pickerOff ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
            {shrinking ? <CircleNotchIcon size={16} weight="bold" className="motion-safe:animate-spin" aria-hidden /> : <CameraIcon size={16} weight="bold" aria-hidden />}
            {shrinking ? "Preparing the photos" : photos.length === 0 ? "Choose photos" : "Add a photo"}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={pickerOff}
              onChange={(e) => {
                const list = [...(e.target.files ?? [])];
                e.target.value = "";
                void choose(list);
              }}
            />
          </label>
          <p className="text-sm text-ink-3">
            Up to {PHOTO_MAX} photos. They&apos;re sent to {props.provider ?? "the AI provider"} to be read, and Farbaek doesn&apos;t keep them.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={read} disabled={running || shrinking || props.readOff !== null || photos.length === 0} className={buttonClasses("primary", "md")}>
            {running && which === "read" ? <CircleNotchIcon size={16} weight="bold" className="motion-safe:animate-spin" aria-hidden /> : <CameraIcon size={16} weight="bold" aria-hidden />}
            {running && which === "read" ? "Reading the photos" : "Read the photos"}
          </button>
          <span className="text-sm text-ink-3">{props.readOff ?? "Uses AI usage. If it fails, it isn't counted."}</span>
        </div>
      </Card>

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <p className="text-sm text-ink-2">
        Lines for walls, fences, drains and buildings come from your field codes, without AI:{" "}
        <Link href={`/app/survey/${props.projectId}?step=boundary`} className="font-medium text-accent underline-offset-4 hover:underline">
          suggest them on the Lots step
        </Link>
        .
      </p>
      {props.document.lots.length > 0 ? <p className="text-sm text-ink-3">The plan has {props.document.lots.map((l) => `lot ${lotName(l) || "without a label"}`).join(", ")} now.</p> : null}
    </div>
  );
}
