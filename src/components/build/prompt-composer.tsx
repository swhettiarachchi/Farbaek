"use client";

import { ArrowUpIcon, CircleNotchIcon, InfoIcon, PaintBrushIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { startFromPromptAction, type PromptStartState } from "@/app/app/new/actions";
import { PROMPT_MAX, PROMPT_MIN } from "@/core/agent/prompt-start";

/** Where a prompt waits through sign-up. Only in this browser, never in a URL. */
export const PROMPT_STORAGE_KEY = "farbaek.prompt";

const EXAMPLES = [
  "A one-page site for my bakery with the menu, opening hours and a map",
  "A portfolio for my photography with a gallery and a contact form",
  "A booking app for my salon where clients pick a time",
  "A dashboard that shows my shop's orders by day",
];

// While the server works: what's actually happening, in order. Live state, so it may move.
const STAGES = ["Setting up your project", "Adding a starter that fits", "Drafting the plan with AI", "Checking the plan"];
// A follow-up goes into a project that already exists, so there's nothing to set up.
const FOLLOW_UP_STAGES = ["Reading your project", "Drafting the plan with AI", "Checking the plan"];

const IDLE: PromptStartState = { status: "idle" };

/** Fired by offerPrompt: a build box on the page takes the sentence and shows it. */
const PROMPT_OFFER_EVENT = "farbaek:prompt-offer";

/**
 * Hands a sentence to the page's build box (the homepage showroom uses it).
 * Returns false when no box took it, so the caller can go on to sign-in;
 * the sentence is kept in this browser either way.
 */
export function offerPrompt(text: string): boolean {
  store(text);
  return !window.dispatchEvent(new CustomEvent(PROMPT_OFFER_EVENT, { detail: text, cancelable: true }));
}

function readStored(): string {
  try {
    return window.localStorage.getItem(PROMPT_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function store(value: string) {
  try {
    if (value.trim()) window.localStorage.setItem(PROMPT_STORAGE_KEY, value);
    else window.localStorage.removeItem(PROMPT_STORAGE_KEY);
  } catch {
    // Storage can be off (private windows): the prompt then lives only in the box.
  }
}

/**
 * "Describe what you want to build." In the app it plans the build on the
 * server; on the public site it keeps the prompt and sends the person to
 * sign in, after which the app picks it up.
 */
export function PromptComposer({
  mode,
  autoResume = false,
  disabledReason = null,
  size = "large",
  projectId,
  template,
  suggestion,
}: {
  mode: "app" | "public";
  autoResume?: boolean;
  disabledReason?: string | null;
  size?: "large" | "compact";
  /** A follow-up for this project, rather than a new build. Not kept in the browser. */
  projectId?: string;
  /** A template chosen in the gallery: the build starts from its files, and its example guides the wording. */
  template?: { id: string; name: string; example: string };
  /** A one-click follow-up the page offers, such as upgrading an older site's design: a note and a button that fills the box. */
  suggestion?: { note: string; label: string; text: string };
}) {
  const followUp = Boolean(projectId);
  const router = useRouter();
  const [state, action, pending] = useActionState(startFromPromptAction, IDLE);
  // A prompt kept from before sign-in shows until the person types; the server render has none.
  const stored = useSyncExternalStore(noSubscribe, readStored, () => "");
  const kept = followUp ? "" : stored;
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? kept;
  const setValue = (next: string) => setDraft(next);
  const form = useRef<HTMLFormElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const resumed = useRef(false);
  // Pressing the button with too little written says what's needed instead of doing nothing.
  const [nudge, setNudge] = useState(false);

  // A sentence offered by the page (offerPrompt): show it here, bring the box into view and focus it.
  useEffect(() => {
    if (followUp) return;
    const take = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (typeof text !== "string" || e.defaultPrevented) return;
      e.preventDefault();
      setDraft(text);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      form.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      box.current?.focus({ preventScroll: true });
    };
    window.addEventListener(PROMPT_OFFER_EVENT, take);
    return () => window.removeEventListener(PROMPT_OFFER_EVENT, take);
  }, [followUp]);

  // After sign-in, send the kept prompt once without asking again.
  useEffect(() => {
    if (!autoResume || followUp || mode !== "app" || resumed.current || !readStored()) return;
    resumed.current = true;
    queueMicrotask(() => form.current?.requestSubmit());
  }, [autoResume, followUp, mode]);

  const tooShort = value.trim().length < PROMPT_MIN;
  const disabled = pending || Boolean(disabledReason);

  return (
    <form
      ref={form}
      action={mode === "app" ? action : undefined}
      onSubmit={(e) => {
        if (tooShort) {
          e.preventDefault();
          setNudge(true);
          box.current?.focus();
          return;
        }
        if (!followUp) store(value);
        if (mode === "public") {
          e.preventDefault();
          router.push("/sign-in?next=/app/new%3Fresume%3D1");
        }
      }}
      className="grid gap-3"
    >
      <div
        className={`group relative rounded-lg border bg-surface shadow-e2 transition-[border-color,box-shadow] duration-200 focus-within:border-accent/60 focus-within:shadow-e3 ${
          state.status === "error" ? "border-failed/50" : "border-line"
        }`}
      >
        {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
        {template && !projectId ? <input type="hidden" name="starter" value={template.id} /> : null}
        <label htmlFor={followUp ? "prompt-next" : "prompt"} className="sr-only">
          {followUp ? "Describe the next change" : "Describe what you want to build"}
        </label>
        <textarea
          ref={box}
          id={followUp ? "prompt-next" : "prompt"}
          name="prompt"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setNudge(false);
            if (!followUp) store(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !disabled) e.currentTarget.form?.requestSubmit();
          }}
          maxLength={PROMPT_MAX}
          rows={size === "large" ? 4 : 2}
          disabled={disabled}
          placeholder={
            followUp
              ? "Describe the next change. For example: add a testimonials section under the menu."
              : template
                ? `Say what it is for. For example: ${template.example}`
                : "Describe what you want to build. For example: a one-page site for my bakery with the menu, opening hours and a map."
          }
          // It grows with its text (and its placeholder) where field-sizing is supported; elsewhere the minimum keeps a phone's three-line placeholder clear of the button.
          className={`block max-h-[50dvh] w-full resize-none rounded-lg bg-transparent px-5 pb-16 pt-4 text-base leading-relaxed text-ink outline-none field-sizing-content placeholder:text-ink-3 disabled:opacity-70 ${size === "large" ? "min-h-44 sm:min-h-36" : "min-h-40 sm:min-h-24"}`}
        />
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3">
          {/* Notes wrap to a second line rather than cut off on narrow phones and with larger system text. */}
          <p className="flex min-w-0 items-center gap-1.5 pl-2 text-xs leading-snug text-ink-3" aria-live="polite">
            {pending ? (
              <PlanningStages stages={projectId ? FOLLOW_UP_STAGES : STAGES} />
            ) : disabledReason ? (
              <span className="line-clamp-2">{disabledReason}</span>
            ) : (
              <span className="hidden truncate sm:inline">You approve the plan before anything is built.</span>
            )}
          </p>
          <button
            type="submit"
            disabled={disabled}
            aria-label={mode === "app" ? "Plan this build" : "Start building"}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-on-primary transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mode === "app" ? "Plan it" : "Start building"}
            <ArrowUpIcon size={16} weight="bold" aria-hidden />
          </button>
        </div>
      </div>

      {nudge && tooShort ? (
        <p role="status" className="flex items-start gap-2 text-sm text-ink-2">
          <InfoIcon size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          {value.trim() ? "Add a few more words, so the plan has something to go on." : "Describe what you want first, in a sentence or two."}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}

      {followUp && suggestion ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">
          <span>{suggestion.note}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setValue(suggestion.text);
              box.current?.focus();
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink shadow-e1 transition-colors hover:border-line-strong/50 disabled:opacity-50"
          >
            <PaintBrushIcon size={16} aria-hidden /> {suggestion.label}
          </button>
        </div>
      ) : null}

      {size === "large" && !followUp ? (
        <ul className="flex flex-wrap gap-2" aria-label="Examples">
          {(template ? [template.example] : EXAMPLES).map((ex) => (
            <li key={ex}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setValue(ex);
                  store(ex);
                }}
                className="min-h-11 rounded-full border border-line bg-surface px-4 py-2 text-left text-sm text-ink-2 transition-colors hover:border-line-strong/50 hover:text-ink disabled:opacity-50"
              >
                {ex}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

const noSubscribe = () => () => {};

/** What the server is doing, advancing while it works. Mounted only while planning, so it always starts at the first stage. */
function PlanningStages({ stages }: { stages: readonly string[] }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStage((s) => Math.min(s + 1, stages.length - 1)), 2_200);
    return () => clearInterval(t);
  }, [stages.length]);
  return (
    <>
      <CircleNotchIcon size={14} weight="bold" className="shrink-0 text-accent motion-safe:animate-spin" aria-hidden />
      <span className="truncate">{stages[stage]}…</span>
    </>
  );
}

/** Clears the kept prompt once its plan exists, so it isn't offered again. */
export function ClearKeptPrompt() {
  useEffect(() => store(""), []);
  return null;
}
