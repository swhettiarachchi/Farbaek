"use client";

/**
 * The public site's menu below 1024px: a full-screen frosted sheet that
 * opens under the floating header, with the links rising in one after
 * another. It's a modal: focus moves in and stays in, Escape closes it and
 * focus returns to the button, and the page behind doesn't scroll. Still
 * under reduced motion.
 */
import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { NAV_LINKS } from "./nav-links";

const EASE = [0.32, 0.72, 0, 1] as const;

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion() ?? false;
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The sheet renders into the body: the header's backdrop blur would otherwise make it size to the island.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Focus the first link once the sheet is there.
    const t = window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>("a")?.focus(), 30);
    // The sheet is for narrow screens: close it if the window grows past the breakpoint.
    const wide = window.matchMedia("(min-width: 1024px)");
    const onWide = () => wide.matches && setOpen(false);
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

  return (
    <div className="lg:hidden" onKeyDown={open ? trap : undefined}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
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

      {mounted
        ? createPortal(
      <AnimatePresence>
        {open ? (
          <motion.div
            key="sheet"
            id={panelId}
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-0 z-30 flex flex-col bg-canvas/90 px-5 pb-8 pt-24 backdrop-blur-2xl supports-[not(backdrop-filter:blur(0))]:bg-canvas"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
          >
            <nav aria-label="Mobile" className="flex-1">
              <ul className="grid gap-1">
                {links.map((link, i) => (
                  <motion.li
                    key={link.href}
                    initial={reduce ? false : { opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: EASE, delay: 0.06 + i * 0.05 }}
                  >
                    <Link
                      href={link.href}
                      onClick={() => close(false)}
                      className="group flex min-h-14 items-center justify-between gap-4 border-b border-line/80 py-2 text-[1.75rem] font-medium tracking-[-0.03em] text-ink"
                    >
                      {link.label}
                      <span className="flex size-10 items-center justify-center rounded-full bg-surface-raised text-ink-2 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-px group-hover:translate-x-0.5">
                        <ArrowUpRightIcon size={17} aria-hidden />
                      </span>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            </nav>
            <motion.div
              className="grid gap-2"
              initial={reduce ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.06 + links.length * 0.05 }}
            >
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
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}

const noSubscribe = () => () => {};
