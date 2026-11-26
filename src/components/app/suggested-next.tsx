"use client";

import Link from "next/link";
import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowRightIcon, LightbulbIcon } from "@/components/icons";
import { buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import { BEZEL } from "@/components/ui/surfaces";
import { DISMISS_KEY, SUGGESTION_KIND_WORDS, SUGGESTION_ORDER, dismissOne, parseDismissals, setKind, visibleSuggestion, type Dismissals, type Suggestion } from "@/core/telepathy/next-steps";

/**
 * What the person has put away, kept in this browser (stage 283, ADR 0291). Read through one store, so the card on Home and the
 * switches in Settings agree, and a browser that blocks storage still remembers for as long as the page is open.
 */
const listeners = new Set<() => void>();
let kept: string | null = null;

function readRaw(): string {
  if (kept !== null) return kept;
  try {
    return window.localStorage.getItem(DISMISS_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeDismissals(next: Dismissals) {
  kept = JSON.stringify(next);
  try {
    window.localStorage.setItem(DISMISS_KEY, kept);
  } catch {
    // Storage blocked: it lasts for this page only.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  const fromElsewhere = () => {
    kept = null;
    listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", fromElsewhere);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", fromElsewhere);
  };
}

/** The person's choices, or null until the page is in the browser: nothing is drawn from a guess. */
function useDismissals(): Dismissals | null {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(() => (raw === null ? null : parseDismissals(raw)), [raw]);
}

const QUIET = "tap inline-flex min-h-10 items-center rounded-full px-2.5 text-sm font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline pointer-coarse:min-h-11";

/**
 * One suggestion on Home, when nothing is waiting for the person (ADR 0291). It says what, opens to say why, and can be put away
 * or switched off. Worked out on the server by tested rules; this only chooses the first one the person hasn't put away.
 */
export function SuggestedNext({ candidates }: { candidates: Suggestion[] }) {
  const heading = useId();
  const panel = useId();
  const dismissals = useDismissals();
  const [now] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  if (!dismissals) return null;
  const s = visibleSuggestion(candidates, dismissals, now);
  if (!s) return null;

  return (
    <section aria-labelledby={heading} className={BEZEL}>
      <div className="grid gap-3 rounded-md bg-surface p-5 shadow-e1 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-label font-medium text-ink-2">
              <LightbulbIcon size={16} weight="bold" className="shrink-0" aria-hidden /> Suggested next
            </p>
            <h2 id={heading} className="mt-2 text-balance text-xl font-medium leading-snug tracking-[-0.02em] [overflow-wrap:anywhere]">
              {s.title}
            </h2>
            <p className="mt-1.5 line-clamp-3 max-w-[60ch] text-body leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{s.body}</p>
          </div>
          <Link href={s.action.href} className={`${buttonClasses("secondary", "md", "w-full justify-center sm:w-auto")} whitespace-nowrap`}>
            {s.action.label} <ArrowRightIcon size={16} weight="bold" aria-hidden />
          </Link>
        </div>
        <div className="-ml-2.5 flex flex-wrap items-center gap-x-1">
          <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((v) => !v)} className={QUIET}>
            {open ? "Hide why" : "Why this?"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              writeDismissals(dismissOne(dismissals, s, Date.now()));
            }}
            className={QUIET}
          >
            Not now
          </button>
        </div>
        {open ? (
          <div id={panel} className="rounded-sm bg-canvas-2 p-3 text-sm leading-relaxed text-ink-2 sm:p-4">
            <p className="text-ink [overflow-wrap:anywhere]">
              {s.why.before}
              <RelativeTime iso={s.why.at} />
              {s.why.after}
            </p>
            <p className="mt-1.5">Farbaek worked this out from your tasks and sites, by fixed rules. No AI model was asked.</p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                writeDismissals(setKind(dismissals, s.kind, true));
              }}
              className={`${QUIET} -ml-2.5 mt-1 underline`}
            >
              Stop suggesting {SUGGESTION_KIND_WORDS[s.kind]}
            </button>
            <p className="text-xs text-ink-3">It stays off in this browser until you switch it back on in Settings.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** The switches for each kind of suggestion, in Settings: where one that was switched off is switched back on. */
export function SuggestionSwitches() {
  const dismissals = useDismissals();
  return (
    <ul className="mt-3 grid gap-2">
      {SUGGESTION_ORDER.map((kind) => {
        const on = dismissals ? !dismissals.kinds.includes(kind) : true;
        const words = SUGGESTION_KIND_WORDS[kind];
        return (
          <li key={kind}>
            <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm pointer-coarse:min-h-11">
              <input type="checkbox" checked={on} disabled={!dismissals} onChange={(e) => dismissals && writeDismissals(setKind(dismissals, kind, !e.target.checked))} className="size-4 accent-[var(--accent)]" />
              <span>{words.charAt(0).toUpperCase() + words.slice(1)}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
