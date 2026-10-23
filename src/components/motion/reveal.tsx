import type { ReactNode } from "react";

/**
 * Fades content up once as the page first paints. It's CSS (reveal-in in
 * globals.css), not a script, so the hero shows the moment the HTML does
 * instead of waiting for JavaScript; with Motion it stayed invisible until
 * hydration, which held the largest paint on phones near four seconds
 * (ADR 0052). Static under reduced motion.
 */
export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <div className={`${className} motion-safe:animate-[reveal-in_360ms_cubic-bezier(0,0,0,1)_both]`} style={delay ? { animationDelay: `${delay}s` } : undefined}>
      {children}
    </div>
  );
}
