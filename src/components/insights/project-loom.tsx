"use client";

/**
 * The Real-Project Loom (ADR 0142, spec §25): an optional 3D view of the
 * same lanes the page lists in 2D. Off until the person turns it on, offered
 * only on a desktop with a mouse, WebGL and motion allowed, and labelled
 * experimental: the spec keeps it off by default until people show it helps.
 * The 2D lanes stay the full, accessible view.
 */
import { CubeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { buttonClasses } from "@/components/ui/button";
import { canRun3D } from "@/components/three/capability";
import { LOOM_STATE_COLORS, LOOM_STATE_WORDS, loomLayout, type LoomNode } from "@/components/three/project-loom-layout";
import { STAGES, STAGE_TITLES, type Lane } from "@/core/insights/project-graph";

const Scene = dynamic(() => import("@/components/three/project-loom-scene"), { ssr: false });

const noSubscribe = () => () => undefined;
const capable = () => canRun3D() && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function ProjectLoom({ lanes }: { lanes: readonly Lane[] }) {
  const ok = useSyncExternalStore(noSubscribe, capable, () => false);
  const [on, setOn] = useState(false);
  const [slow, setSlow] = useState(false);
  const [hovered, setHovered] = useState<LoomNode | null>(null);
  const [visible, setVisible] = useState(true);
  const frame = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { nodes, edges, shown } = useMemo(() => loomLayout(lanes), [lanes]);

  useEffect(() => {
    if (!on || !frame.current) return;
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting) && !document.hidden), { threshold: 0.05 });
    io.observe(frame.current);
    const onHidden = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [on]);

  if (!ok || slow) {
    return (
      <p className="text-sm text-ink-3">
        {slow ? "This device couldn't keep the 3D view smooth, so it's off." : "A 3D view of these lanes is available on a desktop with a mouse, when motion is allowed."} The lanes below show everything.
      </p>
    );
  }

  if (!on) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => setOn(true)}>
          <CubeIcon size={16} weight="bold" aria-hidden /> Show the 3D view
        </button>
        <span className="text-sm text-ink-3">Experimental. Built from the same records as the lanes below.</span>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          {shown < lanes.length ? `The ${shown} newest tasks. ` : null}Point at a stage to read it, click to open its record, drag to turn it.
        </p>
        <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => setOn(false)}>
          <EyeSlashIcon size={16} weight="bold" aria-hidden /> Hide the 3D view
        </button>
      </div>
      <div ref={frame} className="relative h-[420px] overflow-hidden rounded-md border border-line bg-surface" role="img" aria-label="A 3D view of the task lanes listed below, for looking around. The list below has the same information.">
        <Scene
          nodes={nodes}
          edges={edges}
          running={visible}
          hovered={hovered?.id ?? null}
          onHover={setHovered}
          onOpen={(n) => {
            if (n.href) router.push(n.href);
          }}
          onSlow={() => setSlow(true)}
        />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
          <p className="rounded-full bg-surface/90 px-3 py-1 text-xs text-ink-2 shadow-e1">
            {STAGES.map((s) => STAGE_TITLES[s]).join(", then ")}, left to right; newest task in front
          </p>
          {hovered ? (
            <p className="max-w-[28rem] rounded-sm bg-surface/95 px-3 py-2 text-sm text-ink shadow-e2">
              {hovered.label}
              {hovered.href ? <span className="block text-xs text-ink-3">Click to open its record</span> : <span className="block text-xs text-ink-3">No record yet</span>}
            </p>
          ) : null}
        </div>
        <ul className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap gap-x-4 gap-y-1">
          {(Object.keys(LOOM_STATE_COLORS) as (keyof typeof LOOM_STATE_COLORS)[]).map((s) => (
            <li key={s} className="flex items-center gap-1.5 rounded-full bg-surface/90 px-2.5 py-0.5 text-xs text-ink-2">
              <span className="inline-block size-2.5 rounded-full" style={{ background: LOOM_STATE_COLORS[s] }} aria-hidden />
              {LOOM_STATE_WORDS[s]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
