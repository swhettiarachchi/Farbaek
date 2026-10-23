"use client";

/**
 * A film's silent loop (ADR 0055, ADR 0056): the same recording as an
 * animated WebP (`pnpm films:loops`), which every current browser plays
 * without a tap. Players show it where the browser won't start the video on
 * its own: iOS Low Power Mode refuses every video, muted or not, and some
 * in-app browsers need a tap. So the homepage films keep moving like
 * animation. It's only mounted then, so nobody else downloads it; until it
 * arrives, the poster underneath shows.
 */
export function SilentLoop({ src, fit, onFailed }: { src: string; fit: "cover" | "contain"; onFailed: () => void }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- an animated WebP served as it is; the optimiser has nothing to add
    <img
      src={src}
      alt=""
      aria-hidden
      decoding="async"
      onError={onFailed}
      className={`pointer-events-none absolute inset-0 size-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
    />
  );
}
