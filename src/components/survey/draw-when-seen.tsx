"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Lets a sample plan draw itself once, the first time it scrolls into view.
 * It only hides the sheet ("ready") when the sheet is still below the screen,
 * so nobody sees it vanish; a sheet already in view simply stays drawn. With
 * reduced motion the CSS never hides anything.
 */
export function DrawWhenSeen({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.dataset.surveyDraw = "ready";
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        el.dataset.surveyDraw = "on";
        io.disconnect();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
