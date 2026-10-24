"use client";

/**
 * A film's silent loop (ADR 0055, ADR 0056, ADR 0057), shown where the
 * browser won't start the video on its own: iOS Low Power Mode refuses every
 * video, muted or not, and some in-app browsers need a tap.
 *
 * - First choice, the recording itself: Safari plays an MP4 inside a
 *   picture's video/mp4 source as a silent, looping image, at full quality
 *   with the phone's video decoder (Apple's "Delivering Video Content for
 *   Safari"). It's the same file the player would load.
 * - Otherwise the animated WebP (`pnpm films:loops`): browsers that can't
 *   play an MP4 as an image skip that source without downloading it, and an
 *   MP4 that fails falls back to the WebP.
 *
 * Until either arrives, the poster underneath shows.
 */
import { useState } from "react";

export function SilentLoop({ mp4, webp, fit, onFailed }: { mp4: string; webp: string; fit: "cover" | "contain"; onFailed: () => void }) {
  const [webpOnly, setWebpOnly] = useState(false);
  const className = `pointer-events-none absolute inset-0 size-full ${fit === "cover" ? "object-cover" : "object-contain"}`;
  if (webpOnly) {
    // eslint-disable-next-line @next/next/no-img-element -- an animated WebP served as it is; the optimiser has nothing to add
    return <img src={webp} alt="" aria-hidden decoding="async" onError={onFailed} className={className} />;
  }
  return (
    <picture>
      <source srcSet={mp4} type="video/mp4" />
      <img src={webp} alt="" aria-hidden decoding="async" onError={() => setWebpOnly(true)} className={className} />
    </picture>
  );
}
