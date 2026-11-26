"use client";

import { CheckCircleIcon } from "@/components/icons";
import { LEVELS, LEVEL_WORDS, type Level } from "@/core/experience/level";
import { applyLevel, useLevel } from "./apply";

/**
 * Standard, Advanced or Professional, for all of Farbaek (stage 285, ADR 0293). One control, used in Settings and in
 * Chat's settings. Each choice says what it shows before it is pressed; pressing one turns the menus at once and keeps
 * it for a year. `saved` is the choice the server read. `stacked` keeps the three in one column, for a narrow dialog.
 */
export function LevelChoice({ saved, labelledBy, stacked = false }: { saved: Level; labelledBy: string; stacked?: boolean }) {
  const level = useLevel(saved);
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className={`grid gap-2 ${stacked ? "" : "sm:grid-cols-3"}`}>
      {LEVELS.map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={level === value}
          onClick={() => applyLevel(value)}
          className="flex min-h-11 items-start gap-3 rounded-md border border-line bg-surface px-4 py-3 text-left transition-colors duration-150 hover:border-line-strong aria-checked:border-accent aria-checked:bg-canvas-2"
        >
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-sm font-medium text-ink">{LEVEL_WORDS[value].name}</span>
            <span className="text-label leading-snug text-ink-3">{LEVEL_WORDS[value].about}</span>
          </span>
          {level === value ? <CheckCircleIcon size={20} weight="fill" className="mt-0.5 shrink-0 text-accent" aria-hidden /> : <span className="size-5 shrink-0" aria-hidden />}
        </button>
      ))}
    </div>
  );
}
