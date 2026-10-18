import type { Grade } from "@/core/security/findings";

/**
 * The security score as a ring: the share of 100 drawn in signal blue, the
 * score and grade in the middle. The number and grade carry the meaning, so
 * colour is never the only signal. The ring draws in once, and not at all
 * under reduced motion.
 */
export function ScoreRing({ score, grade, size = 132 }: { score: number; grade: Grade; size?: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <figure className="relative grid place-items-center" style={{ width: size, height: size }} aria-label={`Security score ${score} out of 100, grade ${grade}`}>
      <svg viewBox="0 0 120 120" width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-line)" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          className="motion-safe:animate-[score-in_900ms_cubic-bezier(0.16,1,0.3,1)]"
          style={{ ["--score-from" as string]: `0 ${c}` }}
        />
      </svg>
      <figcaption className="absolute inset-0 grid place-content-center text-center">
        <span className="text-4xl font-medium tracking-[-0.03em] tabular">{score}</span>
        <span className="mt-0.5 font-mono text-xs text-ink-3">grade {grade}</span>
      </figcaption>
    </figure>
  );
}
