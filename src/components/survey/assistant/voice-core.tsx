/**
 * The drafting assistant's mark (stage 195): Farbaek's Agent Core (ADR 0025), taught to listen. While listening its core and ring follow
 * the microphone's real level; while working its orbit turns; when it's the surveyor's turn its ring calls. CSS only; still under reduced
 * motion, and always beside words saying the same thing.
 */
import type { CSSProperties } from "react";

export type VoiceCoreState = "idle" | "listening" | "working" | "waiting" | "done" | "failed" | "off";

export function VoiceCore({ state, level = 0, size = "md" }: { state: VoiceCoreState; level?: number; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-8" : "size-10";
  const dot = size === "sm" ? "size-2.5" : "size-3";
  const tone = state === "done" ? "--color-verified" : state === "failed" ? "--color-failed" : state === "off" ? "--color-ink-3" : "--color-accent";
  const lvl = state === "listening" ? Math.max(0, Math.min(1, level)) : 0;
  return (
    <span className={`relative inline-flex ${box} shrink-0 items-center justify-center`} style={{ ["--lvl" as string]: lvl } as CSSProperties} aria-hidden>
      {state === "waiting" ? <span className="absolute inset-0 rounded-full border-2 border-accent/70 motion-safe:animate-[core-call_1.8s_ease-out_infinite]" /> : null}
      {state === "listening" ? <span className="absolute inset-0 rounded-full border-2 border-accent/55 transition-transform duration-75 ease-out motion-safe:[transform:scale(calc(1+var(--lvl)*0.32))]" /> : null}
      <span className="absolute inset-[3px] rounded-full border border-line" style={{ background: `radial-gradient(circle at 35% 30%, var(--color-surface), color-mix(in oklab, var(${tone}) ${state === "listening" ? 24 : 16}%, var(--color-surface)) 70%)` }} />
      <span className={`absolute -inset-[3px] ${state === "working" ? "motion-safe:animate-[core-orbit_3.2s_linear_infinite]" : ""}`}>
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <ellipse cx="20" cy="20" rx="18.5" ry="6.5" fill="none" stroke="var(--color-accent-2)" strokeOpacity={state === "idle" || state === "off" ? 0.35 : 0.75} strokeWidth="1" transform="rotate(-18 20 20)" />
          <circle cx="2.4" cy="25.6" r="1.6" fill="var(--color-accent-2)" />
        </svg>
      </span>
      <span className={`relative ${dot} rounded-full ring-[3px] ring-surface/70 transition-transform duration-75 ease-out motion-safe:[transform:scale(calc(1+var(--lvl)*0.9))]`} style={{ background: `var(${tone})` }} />
    </span>
  );
}
