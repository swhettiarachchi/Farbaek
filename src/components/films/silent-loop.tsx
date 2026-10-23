"use client";

/**
 * A film's recording drawn as an animated image (ADR 0055). Safari plays an
 * MP4 in a picture's source silently and on a loop, like a GIF, even where it
 * refuses to start a video on its own: iOS Low Power Mode refuses every
 * video, muted or not. Apple documents the pattern in "Delivering Video
 * Content for Safari". Other browsers skip the MP4 source without
 * downloading it and draw a transparent pixel, so the poster underneath stays.
 *
 * Players show it only while the film should be moving and the browser has
 * refused the video, and remove it when it goes off screen or a person
 * presses pause.
 */
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export function SilentLoop({ src, fit, onShown }: { src: string; fit: "cover" | "contain"; onShown: () => void }) {
  return (
    <picture>
      <source srcSet={src} type="video/mp4" />
      <img
        src={PIXEL}
        alt=""
        aria-hidden
        decoding="async"
        // Safari chose the MP4: the loop is moving.
        onLoad={(e) => /\.mp4(\?|$)/.test(e.currentTarget.currentSrc) && onShown()}
        className={`pointer-events-none absolute inset-0 size-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
      />
    </picture>
  );
}
