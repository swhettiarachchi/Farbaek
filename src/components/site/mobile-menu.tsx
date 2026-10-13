"use client";

import { ListIcon, XIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { NAV_LINKS } from "./nav-links";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-11 items-center justify-center rounded-sm text-ink hover:bg-surface-sunken"
      >
        {open ? <XIcon size={22} aria-hidden /> : <ListIcon size={22} aria-hidden />}
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-16 border-b border-line bg-canvas px-4 pb-6 pt-2 shadow-e2"
      >
        <nav aria-label="Mobile">
          <ul className="divide-y divide-line">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} onClick={() => setOpen(false)} className="flex h-12 items-center text-base text-ink">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Link href="/#demo" onClick={() => setOpen(false)} className={buttonClasses("primary", "md", "mt-4 w-full")}>
          Try the demo
        </Link>
      </div>
    </div>
  );
}
