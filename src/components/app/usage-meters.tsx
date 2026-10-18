"use client";

import { ArrowUpRightIcon, ChartBarIcon, WarningCircleIcon, WarningIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { loadUsageAction } from "@/app/app/actions";
import { resetText, usageNote, type UsageMeter } from "@/core/billing/usage-view";

const subscribe = () => () => {};

/**
 * "Resets in 3 hr 15 min" in the viewer's time zone. The server render
 * names the UTC date (labelled), then the browser swaps in local wording.
 */
export function ResetText({ resetsAt, period }: { resetsAt: string; period: "trial" | "month" }) {
  const text = useSyncExternalStore(
    subscribe,
    () => resetText(new Date(resetsAt), period, new Date()),
    () => {
      // Independent of the clock, so the server render and hydration always agree.
      const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(resetsAt));
      return period === "trial" ? `Ends with the trial on ${day} (UTC)` : `Resets ${day} (UTC)`;
    },
  );
  return <time dateTime={resetsAt}>{text}</time>;
}

const BAR = { ok: "bg-accent", nearly: "bg-approval", reached: "bg-failed" } as const;

function Row({ meter, detailed }: { meter: UsageMeter; detailed: boolean }) {
  const pct = meter.percent;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
          {meter.label}
          {meter.state === "reached" ? <WarningCircleIcon size={15} weight="bold" className="text-failed" aria-hidden /> : meter.state === "nearly" ? <WarningIcon size={15} weight="bold" className="text-approval" aria-hidden /> : null}
        </p>
        <p className="shrink-0 text-sm text-ink-2 tabular">{pct === null ? "Set by contract" : meter.state === "reached" ? "Limit reached" : `${pct}% used`}</p>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
        role="meter"
        aria-label={meter.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? 0}
        aria-valuetext={pct === null ? "Set by contract" : `${pct}% used`}
      >
        <div className={`h-full rounded-full ${BAR[meter.state]} motion-safe:transition-[width] motion-safe:duration-500`} style={{ width: `${pct ?? 0}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-ink-3">
        <ResetText resetsAt={meter.resetsAt} period={meter.period} />
      </p>
      {detailed && meter.state !== "ok" ? <p className={`mt-1 text-xs ${meter.state === "reached" ? "text-failed" : "text-approval"}`}>{meter.atLimit}</p> : null}
    </div>
  );
}

export function UsageMeterList({ meters, detailed = false }: { meters: UsageMeter[]; detailed?: boolean }) {
  if (meters.length === 0) return <p className="text-sm text-ink-3">Usage couldn&apos;t be read right now.</p>;
  return (
    <div className={detailed ? "grid gap-6" : "grid gap-4"}>
      {meters.map((m) => (
        <Row key={m.id} meter={m} detailed={detailed} />
      ))}
    </div>
  );
}

/** Shown next to an AI action once usage is high: "You've used 84% of your AI usage. Resets in 3 days." */
export function AiUsageNote({ percent, resetsAt, period }: { percent: number | null; resetsAt: string; period: "trial" | "month" }) {
  const note = usageNote(percent);
  if (!note) return null;
  return (
    <span className={percent !== null && percent >= 100 ? "text-failed" : "text-approval"}>
      {note} <ResetText resetsAt={resetsAt} period={period} />.
    </span>
  );
}

type Loaded = { status: "idle" | "loading" } | { status: "ready"; meters: UsageMeter[] } | { status: "error" };

/**
 * The usage panel in the sidebar, modelled on Claude's: a button with the
 * plan, and a small panel with each limit's share used and when it resets.
 * Usage loads when the panel opens, so pages don't pay for it.
 */
export function UsagePanel({ planLabel }: { planLabel: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Loaded>({ status: "idle" });
  // Fixed to the viewport, so the sidebar's scroll area can't clip it.
  const [anchor, setAnchor] = useState<{ left: number; bottom: number }>({ left: 16, bottom: 72 });
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const load = useCallback(async () => {
    setData({ status: "loading" });
    const r = await loadUsageAction().catch(() => null);
    setData(r?.ok ? { status: "ready", meters: r.meters } : { status: "error" });
  }, []);

  function toggle() {
    const next = !open;
    if (next && button.current) {
      const r = button.current.getBoundingClientRect();
      setAnchor({ left: Math.max(8, r.left), bottom: window.innerHeight - r.top + 8 });
    }
    setOpen(next);
    if (next) void load();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div>
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-ink-2 hover:bg-surface aria-expanded:bg-surface"
      >
        <span className="min-w-0 flex-1 truncate">{planLabel}</span>
        <ChartBarIcon size={15} className="shrink-0 text-ink-3" aria-hidden />
        <span className="sr-only">Show usage</span>
      </button>
      {open ? (
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-label="Usage"
          tabIndex={-1}
          style={{ left: anchor.left, bottom: anchor.bottom }}
          className="fixed z-40 w-[min(300px,calc(100vw-16px))] origin-bottom-left rounded-md border border-line bg-surface p-5 shadow-e2 outline-none motion-safe:animate-[usage-in_150ms_cubic-bezier(0.16,1,0.3,1)]"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-medium">Usage</h2>
            <Link href="/app/billing" onClick={() => setOpen(false)} className="inline-flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-surface-raised hover:text-ink" aria-label="Billing and usage">
              <ArrowUpRightIcon size={16} aria-hidden />
            </Link>
          </div>
          {data.status === "ready" ? (
            <UsageMeterList meters={data.meters} />
          ) : data.status === "error" ? (
            <div className="grid gap-3">
              <p className="text-sm text-ink-2">Usage couldn&apos;t be loaded.</p>
              <button type="button" onClick={() => void load()} className="w-fit rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-raised">
                Try again
              </button>
            </div>
          ) : (
            <div className="grid gap-5" aria-busy="true" aria-label="Loading usage">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <div className="flex justify-between gap-3">
                    <span className="h-4 w-24 rounded-full bg-surface-raised" />
                    <span className="h-4 w-14 rounded-full bg-surface-raised" />
                  </div>
                  <span className="mt-2 block h-1.5 rounded-full bg-surface-raised" />
                  <span className="mt-2 block h-3 w-28 rounded-full bg-surface-raised" />
                </div>
              ))}
            </div>
          )}
          <p className="mt-5 border-t border-line pt-3 text-xs text-ink-3">{planLabel}</p>
        </div>
      ) : null}
    </div>
  );
}
