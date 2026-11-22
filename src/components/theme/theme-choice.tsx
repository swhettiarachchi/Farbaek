"use client";

import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import type { Theme } from "@/core/theme/theme";
import { applyTheme, useTheme } from "./apply";

const CHOICES: [Theme, typeof SunIcon, string][] = [
  ["light", SunIcon, "Light"],
  ["dark", MoonIcon, "Dark"],
  ["system", DesktopIcon, "Auto"],
];

/**
 * Light, Dark or Auto, for all of Farbaek (stage 211, ADR 0227). One control, used in Settings and in Chat's settings.
 * `saved` is the choice the server read; pressing one shows it at once and keeps it for a year.
 */
export function ThemeChoice({ saved, labelledBy, onChoose }: { saved: Theme; labelledBy: string; onChoose?: (theme: Theme) => void }) {
  const theme = useTheme(saved);
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-3 rounded-full bg-canvas-2 p-0.5 ring-1 ring-line sm:inline-grid">
      {CHOICES.map(([value, Glyph, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => {
            applyTheme(value);
            onChoose?.(value);
          }}
          className="tap inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm text-ink-2 aria-checked:bg-surface aria-checked:font-medium aria-checked:text-ink aria-checked:shadow-e1"
        >
          <Glyph size={16} weight="bold" aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}
