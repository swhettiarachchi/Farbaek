"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A link to something further down the same page, which may be folded away:
 * it opens what holds the target, scrolls there and moves focus to it, so
 * pressing it always visibly does something. Without scripts it's a plain link.
 */
/** A ring around where the jump landed, once the scrolling stops, so nobody's left wondering what the button did (ADR 0172). */
function showLanded(el: HTMLElement, still: boolean) {
  const flash = () => {
    el.classList.add("jump-landed");
    window.setTimeout(() => el.classList.remove("jump-landed"), 600);
  };
  if (still || !("onscrollend" in window)) return flash();
  let shown = false;
  const once = () => {
    if (shown) return;
    shown = true;
    window.removeEventListener("scrollend", once);
    flash();
  };
  window.addEventListener("scrollend", once);
  // Nothing to scroll means no scrollend.
  window.setTimeout(once, 700);
}

export function JumpLink({ target, className, children }: { target: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={`#${target}`}
      className={className}
      onClick={(e) => {
        const el = document.getElementById(target);
        if (!el) return;
        e.preventDefault();
        for (let d = el.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
        const fold = el.firstElementChild;
        if (fold instanceof HTMLDetailsElement) fold.open = true;
        window.history.pushState(null, "", `#${target}`);
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
        showLanded(el, still);
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
        el.focus({ preventScroll: true });
      }}
    >
      {children}
    </a>
  );
}

/**
 * Detail kept out of the way until someone wants it (ADR 0170), built on the
 * browser's own `<details>`: it works before scripts load, with the keyboard
 * and in find-in-page. It opens by itself when the address points inside it,
 * so a link to a card in here still lands on that card.
 */
export function Disclosure({ summary, hint, children, className = "" }: { summary: string; hint?: string; children: ReactNode; className?: string }) {
  const box = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const openForHash = () => {
      // An address can carry anything after the #, including text that can't be decoded.
      let id = "";
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      const target = id ? document.getElementById(id) : null;
      if (!target || !box.current?.contains(target)) return;
      box.current.open = true;
      target.scrollIntoView();
    };
    openForHash();
    window.addEventListener("hashchange", openForHash);
    return () => window.removeEventListener("hashchange", openForHash);
  }, []);

  return (
    <details ref={box} className={`[&[open]>summary>svg]:rotate-180 ${className}`}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-md border border-line bg-surface px-5 py-3 shadow-e1 transition-colors duration-150 hover:bg-canvas-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <span className="grid min-w-0 gap-0.5">
          <span className="text-[0.9375rem] font-medium">{summary}</span>
          {hint ? <span className="text-[0.8125rem] leading-snug text-ink-3">{hint}</span> : null}
        </span>
        <CaretDownIcon size={16} weight="bold" aria-hidden className="ml-auto shrink-0 text-ink-3 motion-safe:transition-transform motion-safe:duration-200" />
      </summary>
      <div className="mt-6 grid gap-6 motion-safe:animate-[usage-in_200ms_cubic-bezier(0.16,1,0.3,1)]">{children}</div>
    </details>
  );
}
