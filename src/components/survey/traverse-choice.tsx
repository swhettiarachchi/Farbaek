"use client";

import { CheckIcon } from "@phosphor-icons/react";
import type { AdjustMethod, InstrumentPrecision } from "@/core/survey/adjust";

const CHOICES: { value: AdjustMethod | null; label: string; hint: string }[] = [
  { value: null, label: "Keep as shot", hint: "The points stay where the observations put them, and the misclosure is only reported." },
  { value: "compass", label: "Compass rule", hint: "Bowditch: each station moves in proportion to its distance along the traverse. Suits angles and distances measured with similar care." },
  { value: "transit", label: "Transit rule", hint: "Eastings and northings are corrected in proportion to their own sizes. Suits angles measured with more care than distances." },
  {
    value: "least_squares",
    label: "Least squares",
    hint: "Angles and distances adjusted together, each weighted by a typical total station's precision (5″ angles, 2 mm + 2 ppm distances). It says how well they fit that precision, and how sure each station is.",
  },
];

/** Least squares' hint when the office profile states its total station's precision (ADR 0274). */
const ownPrecision = (p: InstrumentPrecision) =>
  `Angles and distances adjusted together, each weighted by the precision your office profile gives for the ${p.instrument ?? "total station"} (${p.angleSeconds}″ angles, ${p.distanceMm} mm + ${p.distancePpm} ppm distances). It says how well they fit that precision, and how sure each station is.`;

/**
 * How to treat a traverse that closes on a known point (stage 231, ADR 0241): kept as shot unless the surveyor chooses a rule. The
 * closure itself is said by the reader's note beside this; Farbaek doesn't judge whether it's good enough for the survey's class.
 */
export function TraverseChoice({ value, onChange, disabled = false, precision }: { value: AdjustMethod | null; onChange: (m: AdjustMethod | null) => void; disabled?: boolean; precision?: InstrumentPrecision | null }) {
  const chosen = CHOICES.find((c) => c.value === value) ?? CHOICES[0]!;
  // On the start screen (precision given, or null for none): the profile's own, or where to give it. Elsewhere, the typical one.
  const hint = chosen.value !== "least_squares" || precision === undefined ? chosen.hint : precision ? ownPrecision(precision) : `${chosen.hint} Give your total station's own precision in your office profile, and Generate Plan weighs by it.`;
  return (
    <div className="grid gap-1.5">
      <p className="text-label font-medium text-ink-2">Adjust the traverse</p>
      {/* Pills that wrap onto a second line in a phone's file row, rather than a track that would bend round them. */}
      <div role="group" aria-label="How to treat the traverse's misclosure" className="flex flex-wrap gap-1.5">
        {CHOICES.map((c) => (
          <button
            key={c.label}
            type="button"
            aria-pressed={c.value === value}
            disabled={disabled}
            onClick={() => c.value !== value && onChange(c.value)}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-label font-medium transition-colors duration-150 pointer-coarse:min-h-11 ${c.value === value ? "border-accent bg-accent/[0.09] text-ink ring-1 ring-accent" : "border-line bg-surface text-ink-2 hover:border-accent/60 hover:text-ink"}`}
          >
            {c.value === value ? <CheckIcon size={14} weight="bold" aria-hidden /> : null}
            {c.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-ink-3">
        {hint} Whether the closure is good enough is for your survey&apos;s class to say: the unadjusted observations stay in the file either way.
      </p>
    </div>
  );
}
