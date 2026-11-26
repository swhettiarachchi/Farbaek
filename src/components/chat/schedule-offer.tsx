"use client";

import { ArrowUpRightIcon, CalendarCheckIcon, CheckCircleIcon, WarningCircleIcon } from "@/components/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { scheduleFromChatAction, scheduleOfferStateAction, type ScheduleOfferState } from "@/app/app/scheduled/actions";
import { SCHEDULE_PROMPT_KEY, habitOffer, scheduleOffer } from "@/core/automation/offer";
import { clock, isTimeZone } from "@/core/automation/schedule";
import { buttonClasses } from "@/components/ui/button";

const noSubscribe = () => () => undefined;
const browserZone = () => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return tz && isTimeZone(tz) ? tz : "UTC";
};

const SEE_ALL = "tap inline-flex items-center gap-1 font-medium text-accent underline-offset-2 hover:underline";

/**
 * Under a Chat answer, the offer to do what was asked on a schedule (stage 273, ADR 0280). "Send me the AI news every morning at 8"
 * is answered now, and a quiet chip offers to do it at that time from then on. Pressing it shows the schedule in a sentence and one
 * button that saves it. The schedule is read from the person's own typed words by tested code, from the moment they sent them;
 * nothing is scheduled until they press, and the server checks it all again. What they already have scheduled is said, not offered
 * twice.
 *
 * Under a roundup asked for with no schedule (stage 280, ADR 0287), the offer is Farbaek's own: the same request every morning.
 * `roundup` says the answer was one, which is Farbaek's finding from its research, never the model's word.
 */
export function ScheduleOffer({ question, askedAt, conversationId, roundup = false }: { question: string; askedAt: string; conversationId: string | null; roundup?: boolean }) {
  const router = useRouter();
  const panel = useId();
  // The person's zone and clock are the browser's: nothing is drawn until the page is there.
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const zone = useSyncExternalStore(noSubscribe, browserZone, () => "UTC");
  const [seen] = useState(() => new Date());
  const offer = useMemo(() => {
    if (!inBrowser) return null;
    const sent = new Date(askedAt);
    // "Tomorrow" is the day after the message was sent, whenever the chat is opened again; a time already past isn't offered.
    // A schedule the person named comes first; a roundup with none is offered every morning.
    return scheduleOffer(question, Number.isNaN(sent.getTime()) ? seen : sent, zone, seen) ?? (roundup ? habitOffer(question, zone, seen) : null);
  }, [inBrowser, question, askedAt, seen, zone, roundup]);
  const [state, setState] = useState<ScheduleOfferState | null>(null);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ status: "idle" } | { status: "error" | "done"; message: string }>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const said = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);

  const offered = offer !== null;
  useEffect(() => {
    if (!offered) return;
    let alive = true;
    scheduleOfferStateAction(question, conversationId)
      .then((s) => alive && setState(s))
      .catch(() => alive && setState({ status: "off" }));
    return () => {
      alive = false;
    };
  }, [offered, question, conversationId]);

  // What was scheduled is said where the buttons were, and the keyboard's place moves to it rather than being dropped.
  const done = result.status === "done";
  useEffect(() => {
    if (done) said.current?.focus();
  }, [done]);

  // The opened card is brought into the part of the chat that shows: it opens under the newest answer, at the bottom of the scroll.
  useEffect(() => {
    if (!open) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.current?.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
  }, [open]);

  if (!offer || !state || state.status === "off") return null;

  const seeAll = (
    <Link href="/app/scheduled" className={SEE_ALL}>
      See your scheduled tasks <ArrowUpRightIcon size={14} weight="bold" aria-hidden />
    </Link>
  );

  if (state.status === "scheduled" || done) {
    return (
      <div ref={said} tabIndex={-1} role="status" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm text-sm text-ink-2 outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
        <span className="inline-flex items-center gap-2">
          <CheckCircleIcon size={16} weight="fill" aria-hidden className="shrink-0 text-verified" />
          {done ? result.message : `This is scheduled. ${state.status === "scheduled" ? state.sentence : ""}${state.status === "scheduled" && state.paused ? " It is paused." : ""}`}
        </span>
        {seeAll}
      </div>
    );
  }

  const repeat = offer.schedule.repeat;
  const note = offer.habit ? " Change it to pick another time or other days." : offer.timeAssumed ? " A usual time, since you gave none." : offer.hourAssumed && repeat.kind !== "hourly" ? ` Taking the hour as ${clock(repeat.time)}.` : "";
  // What the chip and its card are called: the person's own schedule, or Farbaek's suggestion for a roundup.
  const name = offer.habit ? "Get this every morning" : "Do this on a schedule";
  const schedule = () =>
    startTransition(async () => {
      try {
        const r = await scheduleFromChatAction({ instruction: question, schedule: offer.schedule });
        setResult(r.status === "idle" ? { status: "error", message: "Nothing was scheduled. Try again." } : r);
      } catch {
        // The answer was lost on the way back: the task may have been saved. Ask, rather than say it wasn't.
        const after = await scheduleOfferStateAction(question, conversationId).catch(() => null);
        if (after?.status === "scheduled") setState(after);
        else setResult({ status: "error", message: "The connection dropped before Farbaek could say whether it was scheduled. Look in your scheduled tasks before trying again." });
      }
    });
  const change = () => {
    try {
      // Carried in this browser only, never in the address, with the time it was put there: an old one is dropped, not shown later.
      window.localStorage.setItem(SCHEDULE_PROMPT_KEY, JSON.stringify({ text: question.slice(0, 4_000), at: Date.now() }));
    } catch {
      // Storage refused: the form there opens empty.
    }
    router.push("/app/scheduled");
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((v) => !v)}
        className="tap inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm text-ink-2 shadow-e1 transition-[border-color,color] duration-150 hover:border-line-strong/60 hover:text-ink"
      >
        <CalendarCheckIcon size={14} weight="fill" className="text-ink-3" aria-hidden />
        {/* One short word on a phone, the whole phrase from a tablet up, as the answer's other chips do. */}
        <span className="sm:hidden">{offer.habit ? "Every morning" : "Schedule"}</span>
        <span className="max-sm:hidden">{name}</span>
      </button>
      {open ? (
        <section ref={card} id={panel} aria-label={name} className="mt-2 scroll-mb-4 rounded-md border border-line bg-surface p-3 shadow-e1 motion-safe:animate-[chat-rise_240ms_cubic-bezier(0.16,1,0.3,1)_both] sm:p-4">
          <p className="text-sm font-medium text-ink">{offer.sentence}</p>
          {/* What will be asked each time: the person's own message, as they wrote it. */}
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">“{question.trim()}”</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            {note ? `${note.trim()} ` : ""}Farbaek does this by itself then and tells you when it has run. Each run uses your plan&apos;s AI usage, as a message does.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={schedule} disabled={pending} className={buttonClasses("primary", "sm")}>
              {pending ? "Scheduling…" : "Schedule it"}
            </button>
            <button type="button" onClick={change} disabled={pending} className={buttonClasses("secondary", "sm")}>
              Change it
            </button>
          </div>
          {result.status === "error" ? (
            <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-failed">
              <WarningCircleIcon size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0" />
              {result.message}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
