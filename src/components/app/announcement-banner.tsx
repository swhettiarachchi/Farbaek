"use client";

import { InfoIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { useState, useSyncExternalStore } from "react";
import type { Announcement } from "@/server/platform/announcements";

const KEY = "fb-dismissed-announcements";

function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(-50) : [];
  } catch {
    return [];
  }
}

/** Ids a person dismissed on this device; notices only. Incidents can't be dismissed. */
export function nextDismissed(current: readonly string[], id: string): string[] {
  return [...current.filter((x) => x !== id), id].slice(-50);
}

const subscribe = () => () => undefined;

/**
 * Messages from Farbaek across the top of the app. A notice can be closed;
 * an incident stays until Farbaek ends it. Icon and label, not colour alone.
 */
export function AnnouncementBanner({ items }: { items: Announcement[] }) {
  const stored = useSyncExternalStore(subscribe, () => readDismissed().join("\n"), () => "");
  const [closed, setClosed] = useState<string[]>([]);
  const dismissed = new Set([...stored.split("\n").filter(Boolean), ...closed]);
  const visible = items.filter((a) => !(a.dismissible && dismissed.has(a.id)));
  if (visible.length === 0) return null;

  return (
    <div role="region" aria-label="Messages from Farbaek">
      {visible.map((a) => {
        const incident = a.tone === "incident";
        const Icon = incident ? WarningCircleIcon : InfoIcon;
        // One neutral band; the icon's colour says which kind (ADR 0183): burnt orange for an incident, steel for a notice.
        return (
          <div key={a.id} className="flex items-start gap-3 border-b border-line bg-surface-raised px-4 py-2.5 text-[0.8125rem]">
            <Icon size={16} weight="fill" className={`mt-0.5 shrink-0 ${incident ? "text-caution" : "text-info"}`} aria-hidden />
            <p className="min-w-0 flex-1 text-ink">
              <span className="font-medium">{incident ? "Incident: " : "From Farbaek: "}</span>
              {a.message}
            </p>
            {a.dismissible ? (
              <button
                type="button"
                onClick={() => {
                  const next = nextDismissed(readDismissed(), a.id);
                  try {
                    window.localStorage.setItem(KEY, JSON.stringify(next));
                  } catch {
                    // Private windows: it stays closed for this visit only.
                  }
                  setClosed((c) => [...c, a.id]);
                }}
                className="-my-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:text-ink"
                aria-label="Close this message"
              >
                <XIcon size={16} weight="bold" aria-hidden />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
