"use client";

import { ArrowUpIcon, SparkleIcon, WarningCircleIcon } from "@phosphor-icons/react";
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

const IDLE: PromptStartState = { status: "idle" };

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
}: {
  mode: "app" | "public";
  autoResume?: boolean;
  disabledReason?: string | null;
  size?: "large" | "compact";
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(startFromPromptAction, IDLE);
  // A prompt kept from before sign-in shows until the person types; the server render has none.
  const kept = useSyncExternalStore(noSubscribe, readStored, () => "");
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? kept;
  const setValue = (next: string) => setDraft(next);
  const form = useRef<HTMLFormElement>(null);
  const resumed = useRef(false);

  // After sign-in, send the kept prompt once without asking again.
  useEffect(() => {
    if (!autoResume || mode !== "app" || resumed.current || !readStored()) return;
    resumed.current = true;
    queueMicrotask(() => form.current?.requestSubmit());
  }, [autoResume, mode]);

  const tooShort = value.trim().length < PROMPT_MIN;
  const disabled = pending || Boolean(disabledReason);

  return (
    <form
      ref={form}
      action={mode === "app" ? action : undefined}
      onSubmit={(e) => {
        store(value);
        if (mode === "public") {
          e.preventDefault();
          if (!tooShort) router.push("/sign-in?next=/app/new%3Fresume%3D1");
        }
      }}
      className="grid gap-3"
    >
      <div
        className={`group relative rounded-lg border bg-surface shadow-e2 transition-[border-color,box-shadow] duration-200 focus-within:border-accent/60 focus-within:shadow-e3 ${
          state.status === "error" ? "border-failed/50" : "border-line"
        }`}
      >
        <label htmlFor="prompt" className="sr-only">
          Describe what you want to build
        </label>
        <textarea
          id="prompt"
          name="prompt"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            store(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !tooShort && !disabled) e.currentTarget.form?.requestSubmit();
          }}
          maxLength={PROMPT_MAX}
          rows={size === "large" ? 4 : 2}
          disabled={disabled}
          placeholder="Describe what you want to build. For example: a one-page site for my bakery with the menu, opening hours and a map."
          className={`block w-full resize-none rounded-lg bg-transparent px-5 pb-16 pt-4 text-base leading-relaxed text-ink outline-none placeholder:text-ink-3 disabled:opacity-70 ${size === "large" ? "min-h-36" : "min-h-24"}`}
        />
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.5 truncate pl-2 text-xs text-ink-3" aria-live="polite">
            {pending ? (
              <PlanningStages />
            ) : disabledReason ? (
              <span className="truncate">{disabledReason}</span>
            ) : (
              <span className="hidden truncate sm:inline">You approve the plan before anything is built.</span>
            )}
          </p>
          <button
            type="submit"
            disabled={disabled || tooShort}
            aria-label={mode === "app" ? "Plan this build" : "Start building"}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-on-primary transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mode === "app" ? "Plan it" : "Start building"}
            <ArrowUpIcon size={16} weight="bold" aria-hidden />
          </button>
        </div>
      </div>

      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}

      {size === "large" ? (
        <ul className="flex flex-wrap gap-2" aria-label="Examples">
          {EXAMPLES.map((ex) => (
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
function PlanningStages() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2_200);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <SparkleIcon size={14} weight="fill" className="shrink-0 text-accent motion-safe:animate-pulse" aria-hidden />
      <span className="truncate">{STAGES[stage]}…</span>
    </>
  );
}

/** Clears the kept prompt once its plan exists, so it isn't offered again. */
export function ClearKeptPrompt() {
  useEffect(() => store(""), []);
  return null;
}
