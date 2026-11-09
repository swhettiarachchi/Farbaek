"use client";

/**
 * The public site's menu below 1024px: a full-screen frosted sheet that
 * opens under the floating header, with the links rising in one after
 * another. It's a modal: focus moves in and stays in, Escape closes it and
 * focus returns to the button, and the page behind doesn't scroll. Still
 * under reduced motion.
 *
 * The motion is CSS (sheet-in, sheet-out, menu-rise in globals.css), so
 * every public page doesn't download an animation library for a menu
 * (ADR 0052).
 */
import { ArrowUpRightIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { NAV_LINKS } from "./nav-links";

/** How long the sheet takes to fade out; it stays mounted that long. */
const CLOSE_MS = 220;
const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

export function MobileMenu() {
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const open = phase === "open";
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The sheet renders into the body: the header's backdrop blur would otherwise make it size to the island.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

  const close = (refocus = true) => {
    // Under reduced motion it goes at once; otherwise it fades out first.
    setPhase(window.matchMedia(REDUCE_QUERY).matches ? "closed" : "closing");
    if (refocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (phase !== "closing") return;
    const t = window.setTimeout(() => setPhase("closed"), CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setPhase("closed");
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Focus the first link once the sheet is there.
    const t = window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>("a")?.focus(), 30);
    // The sheet is for narrow screens: close it if the window grows past the breakpoint.
    const wide = window.matchMedia("(min-width: 1024px)");
    const onWide = () => wide.matches && setPhase("closed");
    wide.addEventListener("change", onWide);
    return () => {
      root.style.overflow = before;
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  // Tab stays inside the sheet and the menu button.
  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>("a, button") ?? [])];
    if (buttonRef.current) items.unshift(buttonRef.current);
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };

  const links = [...NAV_LINKS, { href: "/#status", label: "What works today" }];
  const rise = (i: number): CSSProperties => ({ animationDelay: `${60 + i * 50}ms` });

  return (
    <div className="lg:hidden" onKeyDown={open ? trap : undefined}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setPhase("open"))}
        className="relative inline-flex size-11 items-center justify-center rounded-full text-ink transition-colors duration-200 hover:bg-surface-raised"
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <span aria-hidden className="relative block h-3 w-5">
          <span
            className={`absolute left-0 h-[1.5px] w-5 rounded-full bg-current transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${open ? "top-[5px] rotate-45" : "top-0"}`}
          />
          <span
            className={`absolute left-0 h-[1.5px] w-5 rounded-full bg-current transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${open ? "top-[5px] -rotate-45" : "top-[10px]"}`}
          />
        </span>
      </button>

      {mounted && phase !== "closed"
        ? createPortal(
            <div
              id={panelId}
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              inert={phase === "closing"}
              className={`fixed inset-0 z-30 flex flex-col bg-canvas/90 px-5 pb-8 pt-24 backdrop-blur-2xl supports-[not(backdrop-filter:blur(0))]:bg-canvas ${
                phase === "closing" ? "motion-safe:animate-[sheet-out_220ms_cubic-bezier(0.32,0.72,0,1)_both]" : "motion-safe:animate-[sheet-in_300ms_cubic-bezier(0.32,0.72,0,1)_both]"
              }`}
            >
              <nav aria-label="Mobile" className="flex-1">
                <ul className="grid gap-1">
                  {links.map((link, i) => (
                    <li key={link.href} className="motion-safe:animate-[menu-rise_500ms_cubic-bezier(0.32,0.72,0,1)_both]" style={rise(i)}>
                      <Link
                        href={link.href}
                        onClick={() => close(false)}
                        className="group flex min-h-14 items-center justify-between gap-4 border-b border-line/80 py-2 text-[1.75rem] font-medium tracking-[-0.03em] text-ink"
                      >
                        {link.label}
                        <span className="flex size-10 items-center justify-center rounded-full bg-surface-raised text-ink-2 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-px group-hover:translate-x-0.5">
                          <ArrowUpRightIcon size={16} weight="bold" aria-hidden />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="grid gap-2 motion-safe:animate-[menu-rise_500ms_cubic-bezier(0.32,0.72,0,1)_both]" style={rise(links.length)}>
                <Link
                  href="/sign-in?next=/app/new"
                  onClick={() => close(false)}
                  className="flex h-14 items-center justify-center rounded-full bg-primary text-base font-medium text-on-primary shadow-e2 active:scale-[0.98]"
                >
                  Start building
                </Link>
                <Link
                  href="/sign-in"
                  onClick={() => close(false)}
                  className="flex h-14 items-center justify-center rounded-full border border-line bg-surface text-base font-medium text-ink active:scale-[0.98]"
                >
                  Sign in
                </Link>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

const noSubscribe = () => () => {};
