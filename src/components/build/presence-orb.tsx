"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PRESENCE_LABELS, type AgentPresence } from "@/core/agent/inbox";
import { CoreMark } from "./core-mark";

/** How often to look again: often while an agent is live, rarely when none is. */
const EVERY_MS = { idle: 30_000, live: 8_000 };

/**
 * The workspace's agents, present on every page (Phase C): a small Agent
 * Core with words beside it. It checks more often while an agent is live,
 * pauses while the tab is hidden, and opens the run that needs the person.
 */
export function PresenceOrb({ orgId, initial, compact = false }: { orgId: string | null; initial: AgentPresence; compact?: boolean }) {
  const [presence, setPresence] = useState(initial);
  const last = useRef(initial.state);

  useEffect(() => {
    if (!orgId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(tick, last.current === "idle" ? EVERY_MS.idle : EVERY_MS.live);
    };
    const tick = async () => {
      if (!document.hidden) {
        try {
          const res = await fetch(`/app/agent-status?org=${orgId}`, { cache: "no-store" });
          if (res.ok && !stopped) {
            const next = ((await res.json()) as { data: AgentPresence }).data;
            last.current = next.state;
            setPresence(next);
          }
        } catch {
          // A missed check is tried again on the next tick.
        }
      }
      if (!stopped) schedule();
    };
    const onVisible = () => {
      if (document.hidden || stopped) return;
      clearTimeout(timer);
      void tick();
    };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [orgId]);

  const label = PRESENCE_LABELS[presence.state](presence.count);
  const href = presence.runId ? `/app/build/${presence.runId}` : "/app/build";

  if (compact) {
    return (
      <Link href={href} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full" aria-label={label} title={label}>
        <CoreMark state={presence.state} size="sm" />
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={`flex min-h-11 items-center gap-2.5 rounded-full border px-2.5 text-[0.84375rem] transition-colors duration-150 hover:bg-surface ${
        presence.state === "waiting" ? "border-accent/45 text-ink" : "border-line text-ink-2"
      }`}
    >
      <CoreMark state={presence.state} size="sm" />
      <span className="min-w-0 flex-1 truncate" role="status" aria-live="polite" title={label}>
        {label}
      </span>
    </Link>
  );
}
