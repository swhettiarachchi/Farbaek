/**
 * A small Agent Core (ADR 0025) for lists and the app's chrome: a glass orb
 * whose orbit turns while an agent works and whose ring calls while one
 * waits for a person. CSS only, so it costs nothing to show many; still
 * under reduced motion. Always paired with words, never the only signal.
 */
export type CoreMarkState = "idle" | "working" | "waiting" | "review" | "done" | "stopped";

const TONE: Record<CoreMarkState, { core: string; glass: string }> = {
  idle: { core: "bg-accent/45", glass: "--color-accent" },
  working: { core: "bg-accent", glass: "--color-accent" },
  waiting: { core: "bg-approval", glass: "--color-approval" },
  review: { core: "bg-accent", glass: "--color-accent" },
  done: { core: "bg-verified", glass: "--color-verified" },
  stopped: { core: "bg-ink-3", glass: "--color-ink-3" },
};

export function CoreMark({ state, size = "md" }: { state: CoreMarkState; size?: "sm" | "md" }) {
  const tone = TONE[state];
  const box = size === "sm" ? "size-7" : "size-9";
  const dot = size === "sm" ? "size-2" : "size-2.5";
  return (
    <span className={`relative inline-flex ${box} shrink-0 items-center justify-center`} aria-hidden>
      {state === "waiting" ? <span className="absolute inset-0 rounded-full border-2 border-approval/70 motion-safe:animate-[core-call_1.8s_ease-out_infinite]" /> : null}
      <span
        className="absolute inset-[3px] rounded-full border border-line"
        style={{ background: `radial-gradient(circle at 35% 30%, var(--color-surface), color-mix(in oklab, var(${tone.glass}) 16%, var(--color-surface)) 70%)` }}
      />
      <span className={`absolute -inset-[3px] ${state === "working" ? "motion-safe:animate-[core-orbit_3.2s_linear_infinite]" : ""}`}>
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <ellipse cx="20" cy="20" rx="18.5" ry="6.5" fill="none" stroke="var(--color-accent-2)" strokeOpacity={state === "idle" || state === "stopped" ? 0.35 : 0.75} strokeWidth="1" transform="rotate(-18 20 20)" />
          <circle cx="2.4" cy="25.6" r="1.6" fill="var(--color-accent-2)" />
        </svg>
      </span>
      <span className={`relative ${dot} rounded-full ${tone.core} ring-[3px] ring-surface/70`} />
    </span>
  );
}
