import { BrandLogo } from "./brand-logo";

/**
 * Farbaek AI beside what it says or does: the cat, bare (on Chat's dark theme it sits on its own white paper, ADR 0226).
 * While it is thinking, writing or working, a small orbit turns round him, the same sign the agent's mark gives for work
 * in progress (`core-orbit`); it is still under reduced motion. Used beside Chat's answers (ADR 0218) and the agent's
 * side of Build's workspace (ADR 0219).
 */
export function BrandMark({ live, className = "" }: { live: boolean; className?: string }) {
  return (
    <span aria-hidden className={`relative mt-0.5 size-8 shrink-0 items-center justify-center ${className}`}>
      {live ? (
        <span className="absolute -inset-2 motion-safe:animate-[chat-fade_200ms_ease-out_both]">
          <span className="absolute inset-0 motion-safe:animate-[core-orbit_2.6s_linear_infinite]">
            <svg viewBox="0 0 44 44" className="h-full w-full">
              <ellipse cx="22" cy="22" rx="20.5" ry="7" fill="none" stroke="var(--color-accent)" strokeOpacity="0.55" strokeWidth="1" transform="rotate(-18 22 22)" />
              <circle cx="2.5" cy="28.3" r="1.9" fill="var(--color-accent)" />
            </svg>
          </span>
        </span>
      ) : null}
      <BrandLogo height={28} className="relative" />
    </span>
  );
}
