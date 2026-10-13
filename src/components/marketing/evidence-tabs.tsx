"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface EvidenceTab {
  id: string;
  label: string;
  content: ReactNode;
}

/** Accessible tabs (WAI-ARIA pattern with arrow-key navigation). Panels are rendered on the server. */
export function EvidenceTabs({ tabs }: { tabs: EvidenceTab[] }) {
  const [active, setActive] = useState(0);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (active + delta + tabs.length) % tabs.length;
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <div className="overflow-hidden rounded-[28px] bg-media shadow-e3">
      <div role="tablist" aria-label="Evidence samples" className="flex border-b border-white/[0.07] px-2">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${base}-tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={active === i}
            aria-controls={`${base}-panel-${tab.id}`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={onKeyDown}
            className={`relative h-11 px-4 font-mono text-[13px] transition-colors duration-[140ms] ${
              active === i ? "text-media-ink" : "text-media-ink-3 hover:text-media-ink-2"
            }`}
          >
            {tab.label}
            {active === i ? <span aria-hidden className="absolute inset-x-4 -bottom-px h-[2px] rounded-full bg-media-accent" /> : null}
          </button>
        ))}
      </div>
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          id={`${base}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${tab.id}`}
          hidden={active !== i}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
