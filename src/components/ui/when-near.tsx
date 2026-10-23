"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Mounts its children once they come within `margin` of the screen, and
 * shows `placeholder` until then. For heavy widgets far down a page, such as
 * a code editor: phones don't download and start them before anyone scrolls
 * there (ADR 0052). Once mounted, they stay.
 */
export function WhenNear({ children, placeholder, margin = "600px" }: { children: ReactNode; placeholder: ReactNode; margin?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") {
      const t = setTimeout(() => setNear(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          setNear(true);
        }
      },
      { rootMargin: `${margin} 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, margin]);

  return <div ref={box}>{near ? children : placeholder}</div>;
}
