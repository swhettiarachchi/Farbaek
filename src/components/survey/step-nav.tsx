"use client";

/**
 * Survey Studio's steps (stage 196): one strip that scrolls sideways on a phone, without a scrollbar and with its edges faded, and
 * that brings the step you're on into view, so History or Settings is never off the screen when it's the one open.
 */
import {
  ClockCounterClockwiseIcon,
  DownloadSimpleIcon,
  FileArrowUpIcon,
  GearSixIcon,
  ListChecksIcon,
  MapPinSimpleIcon,
  PenNibIcon,
  PolygonIcon,
  RulerIcon,
  type Icon,
} from "@/components/icons";
import Link from "next/link";
import { useEffect, useRef } from "react";

const ICONS: Record<string, Icon> = {
  import: FileArrowUpIcon,
  points: MapPinSimpleIcon,
  draft: PenNibIcon,
  boundary: PolygonIcon,
  plan: RulerIcon,
  check: ListChecksIcon,
  export: DownloadSimpleIcon,
  history: ClockCounterClockwiseIcon,
  settings: GearSixIcon,
};

export function StepNav({ steps, current, base }: { steps: readonly { id: string; label: string }[]; current: string; base: string }) {
  const active = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // Only the strip scrolls: "nearest" leaves the page where it is.
    active.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [current]);
  return (
    <nav
      aria-label="Survey steps"
      className="-mx-4 overflow-x-auto px-4 py-px [mask-image:linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-1rem),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ol className="flex w-max gap-1 rounded-full bg-canvas-2 p-1 ring-1 ring-line">
        {steps.map((s) => {
          const StepIcon = ICONS[s.id] ?? RulerIcon;
          const on = s.id === current;
          return (
            <li key={s.id}>
              <Link
                ref={on ? active : undefined}
                href={`${base}?step=${s.id}`}
                aria-current={on ? "page" : undefined}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-label font-medium transition-colors duration-150 pointer-coarse:min-h-11 sm:px-3.5 ${on ? "bg-surface text-ink shadow-e1" : "text-ink-2 hover:text-ink"}`}
              >
                <StepIcon size={14} weight="bold" aria-hidden />
                {s.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
