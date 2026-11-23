"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MODE_HINTS, MODE_LABELS, SURVEY_MODES, SURVEY_MODE_COOKIE, type SurveyMode } from "@/core/survey/modes";

/** Kept for this person for a year, on Survey Studio's pages only. */
function remember(m: SurveyMode): void {
  document.cookie = `${SURVEY_MODE_COOKIE}=${m}; path=/app/survey; max-age=31536000; samesite=lax`;
}

/**
 * Express, Professional or Manual CAD (stage 227, ADR 0238): which of the project's steps are on show, kept for this person in a
 * cookie for a year. The project and its versions are the same in every mode.
 */
export function ModeChoice({ mode }: { mode: SurveyMode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (m: SurveyMode) => {
    if (m === mode) return;
    remember(m);
    start(() => router.refresh());
  };
  return (
    <div className="grid gap-1.5">
      <div role="group" aria-label="How much of the project to show" className="flex w-fit flex-wrap gap-1 rounded-full bg-canvas-2 p-1 ring-1 ring-line">
        {SURVEY_MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={m === mode}
            disabled={pending}
            onClick={() => choose(m)}
            className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-label font-medium transition-colors duration-150 pointer-coarse:min-h-11 ${m === mode ? "bg-surface text-ink shadow-e1" : "text-ink-2 hover:text-ink"}`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>
      <p className="text-sm text-ink-3">{MODE_HINTS[mode]}</p>
    </div>
  );
}
