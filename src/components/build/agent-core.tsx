"use client";

import { useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { canRun3D, whenIdle } from "@/components/three/capability";
import { StatusGlyph, type Status } from "@/components/ui/status-badge";
import { CORE_PHASE_LABELS, type Activity, type CorePhase } from "@/core/agent/run-phase";

const AgentCoreScene = dynamic(() => import("@/components/three/agent-core-scene"), { ssr: false });

// Each phase is one of the shared kinds (ADR 0183), so its words always come with their icon: not yet while idle,
// a turning circle while the agent works, "your turn" while it waits, and how it ended. `tone` colours the core itself.
const PHASE_STYLE: Record<CorePhase, { kind: Status; tone: string }> = {
  idle: { kind: "unverified", tone: "text-accent" },
  starting: { kind: "working", tone: "text-accent" },
  working: { kind: "working", tone: "text-accent" },
  thinking: { kind: "working", tone: "text-accent" },
  reading: { kind: "working", tone: "text-accent" },
  writing: { kind: "working", tone: "text-accent" },
  running: { kind: "working", tone: "text-accent" },
  waiting: { kind: "approval", tone: "text-approval" },
  done: { kind: "done", tone: "text-verified" },
  stopped: { kind: "off", tone: "text-ink-3" },
};

/** The still version: shown first, under reduced motion, Save-Data, weak hardware or a slow first second. */
function StaticCore({ phase }: { phase: CorePhase }) {
  const tone = PHASE_STYLE[phase].tone;
  return (
    <svg viewBox="0 0 200 200" className={`absolute inset-0 h-full w-full ${tone}`} aria-hidden>
      <defs>
        <radialGradient id="core-rim" cx="50%" cy="50%" r="50%">
          <stop offset="62%" stopColor="currentColor" stopOpacity="0.04" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="100" rx="88" ry="30" fill="none" stroke="var(--color-accent-2)" strokeOpacity="0.7" strokeWidth="1.2" transform="rotate(-12 100 100)" />
      <ellipse cx="100" cy="100" rx="96" ry="44" fill="none" stroke="var(--color-ink)" strokeOpacity="0.12" strokeWidth="0.9" transform="rotate(20 100 100)" />
      <circle cx="100" cy="100" r="54" fill="url(#core-rim)" />
      <circle cx="100" cy="100" r="54" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
      <polygon points="100,64 131,82 131,118 100,136 69,118 69,82" fill="none" stroke="currentColor" strokeOpacity="0.32" strokeWidth="1" />
      <circle cx="100" cy="100" r="12" fill="currentColor" />
      <circle cx="12" cy="100" r="2.6" fill="var(--color-accent-2)" transform="rotate(-12 100 100)" />
      <circle cx="188" cy="100" r="2.6" fill="var(--color-accent-2)" transform="rotate(-12 100 100)" />
    </svg>
  );
}

/**
 * The Agent Core (ADR 0025): the run's live state as a 3D object, with its
 * phase in words beside it. The static core renders first; the 3D scene
 * loads once the browser is idle on a capable device and cross-fades in.
 */
/** `kind` says how a stopped run ended (failed, cancelled, interrupted), which the phase alone doesn't. */
export function AgentCore({ phase, activity = null, kind, children }: { phase: CorePhase; activity?: Activity | string | null; kind?: Status; children?: React.ReactNode }) {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [want3D, setWant3D] = useState(false);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (reduce) return;
    return whenIdle(() => {
      if (canRun3D()) setWant3D(true);
    });
  }, [reduce]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting) && !document.hidden), { threshold: 0.05 });
    io.observe(el);
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const onReady = useCallback(() => setReady(true), []);
  const onSlow = useCallback(() => {
    setWant3D(false);
    setReady(false);
  }, []);
  const show3D = want3D && !reduce;
  const fade = (on: boolean) => `transition-opacity duration-300 ${on ? "opacity-100" : "opacity-0"}`;
  const style = PHASE_STYLE[phase];

  return (
    <section aria-label="Farbaek Agent" className="relative isolate overflow-hidden rounded-lg border border-line bg-surface shadow-e2">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 90% at 12% 50%, color-mix(in oklab, var(--color-accent) 7%, transparent), transparent 70%), radial-gradient(40% 70% at 0% 100%, color-mix(in oklab, var(--color-accent-2) 6%, transparent), transparent 70%)",
        }}
      />
      <div className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-4 p-4 sm:grid-cols-[168px_minmax(0,1fr)] sm:gap-6 sm:p-6">
        <div ref={box} className="relative aspect-square">
          <div className={`absolute inset-0 ${fade(!ready)}`}>
            <StaticCore phase={phase} />
          </div>
          {show3D ? (
            <div className={`absolute -inset-[14%] ${fade(ready)}`}>
              <AgentCoreScene phase={phase} active={visible} onReady={onReady} onSlow={onSlow} />
            </div>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xl font-medium tracking-[-0.02em] sm:text-2xl" role="status" aria-live="polite">
            <StatusGlyph status={kind ?? style.kind} size={24} />
            {CORE_PHASE_LABELS[phase]}
          </p>
          {/* The step in words (ADR 0180); only a path or a command is mono. A finished run's outcome is a sentence. */}
          {typeof activity === "string" ? (
            <p className="mt-1.5 line-clamp-2 text-[0.8125rem] text-ink-2">{activity}</p>
          ) : activity ? (
            <p className="mt-1.5 truncate text-[0.8125rem] text-ink-2" title={activity.detail ? `${activity.words} ${activity.detail.text}` : activity.words}>
              {activity.words}
              {activity.detail ? <> {activity.detail.mono ? <span className="font-mono">{activity.detail.text}</span> : activity.detail.text}</> : null}
            </p>
          ) : null}
          {children ? <div className="mt-3">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
