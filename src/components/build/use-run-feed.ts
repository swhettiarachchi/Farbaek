"use client";

/**
 * A run, kept current while it is live (ADR 0027, shared since stage 202): the run page and Build's workspace both read a
 * run this way. It asks the run's own events route for what is new every second and a half, and stops when the run does.
 * A missed request is simply tried again on the next tick.
 */
import { useEffect, useRef, useState } from "react";
import { isLive } from "@/core/agent/cloud-run";
import type { RunEventView, RunView } from "@/server/cloud-agent/store";
import type { RunUsageView } from "@/server/workspace/plan-card-data";

export const POLL_MS = 1_500;

export function useRunFeed({ initialRun, initialEvents, initialUsage }: { initialRun: RunView; initialEvents: RunEventView[]; initialUsage: RunUsageView }) {
  const [run, setRun] = useState(initialRun);
  const [usage, setUsage] = useState(initialUsage);
  const [events, setEvents] = useState(initialEvents);
  const cursor = useRef(initialEvents.at(-1)?.id ?? 0);
  const live = isLive(run.status);

  useEffect(() => {
    if (!live) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/app/build/${run.id}/events?after=${cursor.current}`, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { data: { run: RunView; events: RunEventView[]; usage: RunUsageView } };
          if (!stopped) {
            setRun(body.data.run);
            if (body.data.usage) setUsage(body.data.usage);
            if (body.data.events.length) {
              cursor.current = body.data.events.at(-1)!.id;
              setEvents((prev) => [...prev, ...body.data.events]);
            }
          }
        }
      } catch {
        // A missed poll is retried on the next tick.
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [live, run.id]);

  return { run, setRun, usage, events, live };
}
