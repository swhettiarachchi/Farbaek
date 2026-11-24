"use client";

import { ArrowCounterClockwiseIcon, CheckCircleIcon, ScribbleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { readSketchesAction, type SketchReadState } from "@/app/app/survey/ai-actions";
import { Card, CardTitle } from "@/components/app/primitives";
import { buttonClasses } from "@/components/ui/button";
import { sketchesKey, staged, unstage } from "./staging";
import { keptSketches, readAlready, type KeptSketches } from "./start-uploads";
import { PLAN_UNSAVED_REASON, usePlanUnsaved } from "./unsaved-plan";

/** A read sent from the Draft step may still be working on the server for this long after its photos were kept. */
const STILL_READING_MS = 5 * 60_000;

/**
 * A sketch read that didn't finish, finished from the photos this browser kept (stage 250, ADR 0258). The photos stay here until a read
 * of them is saved: if the page was closed, refreshed or lost its connection first, this card offers to read them now, with the same
 * consent the read needs anywhere, or to forget them. Nothing shows while the read may still be working, and once a read of these
 * photos is saved they're forgotten.
 */
export function ResumeSketches(props: {
  projectId: string;
  orgId: string;
  userId: string | null;
  baseVersion: number;
  /** The Generate Plan run still working on this project, if any: its own read may still come back. */
  runningJobId: string | null;
  /** The sketches read into this plan, if any. */
  record: { readAt: string; files: string[]; readings: number } | null;
  /** Why reading is off here, or null. */
  readOff: string | null;
  aiCost: string;
}) {
  const router = useRouter();
  const { projectId, orgId, userId, record, runningJobId } = props;
  const [kept, setKept] = useState<KeptSketches | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const unsaved = usePlanUnsaved();
  const readAt = record?.readAt ?? null;
  const files = record?.files.join("\n") ?? "";
  useEffect(() => {
    if (!userId) return;
    let live = true;
    const key = sketchesKey(orgId, userId, projectId);
    void staged(key).then((s) => {
      if (!live) return;
      if (s.status !== "found") {
        setKept(null);
        return;
      }
      const photos = keptSketches(s.value);
      if (!photos || readAlready({ before: photos.before, names: photos.photos.map((p) => p.name) }, readAt ? { readAt, files: files.split("\n") } : null)) {
        setKept(null);
        void unstage(key);
        return;
      }
      // Its read may still be working: the run that sent it is, or it was sent from the Draft step a moment ago. The page refreshes
      // itself while a run works, so the card comes back if the read never lands.
      const working = photos.jobId ? photos.jobId === runningJobId : Date.now() - s.at < STILL_READING_MS;
      setKept(working ? null : photos);
    });
    return () => {
      live = false;
    };
  }, [orgId, userId, projectId, readAt, files, runningJobId]);

  if (!kept || !userId) return message?.ok ? <Said ok text={message.text} /> : null;
  const n = kept.photos.length;
  const off = props.readOff ?? (unsaved ? PLAN_UNSAVED_REASON : null);
  const forget = () => {
    void unstage(sketchesKey(orgId, userId, projectId));
    setKept(null);
  };
  const read = () =>
    start(async () => {
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("baseVersion", String(props.baseVersion));
      form.set("consent", "yes");
      for (const p of kept.photos) form.append("photo", p.blob, p.name);
      const r = await readSketchesAction(form).catch((): SketchReadState => ({ status: "error", message: "The connection dropped while the sketches were sent. They're still here: try again." }));
      if (r.status === "done") {
        await unstage(sketchesKey(orgId, userId, projectId));
        setKept(null);
        setMessage({ ok: true, text: r.message });
        router.refresh();
      } else if (r.status === "error") setMessage({ ok: false, text: r.message });
    });
  const them = n === 1 ? "it" : "them";

  return (
    <Card>
      <CardTitle icon={ScribbleIcon}>Sketches still to read</CardTitle>
      <p className="mt-1 break-words text-sm text-ink-2">
        {n === 1 ? "A sketch photo" : `${n} sketch photos`} from a read that didn&apos;t finish {n === 1 ? "is" : "are"} still in this browser: {kept.photos.map((p) => p.name).join(", ")}.{" "}
        {record && record.readings > 0
          ? `Reading ${them} replaces the ${record.readings} ${record.readings === 1 ? "thing" : "things"} read from sketches now on this plan, and any answers you gave about them.`
          : `Read ${them} now, and what's on ${them} is added to this plan as a read from the Draft step would.`}
      </p>
      <p className="mt-2 text-sm text-ink-3">
        Reading sends {n === 1 ? "this photo" : "these photos"} to Anthropic, outside Sri Lanka, for Claude to read. When something is read, Farbaek keeps them with this plan, beside their readings. {props.aiCost}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={read} disabled={pending || off !== null} className={buttonClasses("primary", "md")}>
          <ArrowCounterClockwiseIcon size={16} weight="bold" aria-hidden />
          {pending ? "Reading…" : `Send and read ${them} now`}
        </button>
        <button type="button" onClick={forget} disabled={pending} className={buttonClasses("ghost", "md")}>
          Forget {them}
        </button>
      </div>
      {off && !pending ? <p className="mt-2 text-sm text-ink-3">{off}</p> : null}
      {message && !message.ok ? <Said ok={false} text={message.text} /> : null}
    </Card>
  );
}

function Said({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p role={ok ? "status" : "alert"} className={`flex items-start gap-2 text-sm ${ok ? "text-ink-2" : "mt-2 text-failed"}`}>
      {ok ? <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden /> : <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />}
      {text}
    </p>
  );
}
