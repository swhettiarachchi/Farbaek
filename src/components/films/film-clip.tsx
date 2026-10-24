"use client";

/**
 * A short, silent feature clip that loops beside its text like an animation
 * (ADR 0034, ADR 0055, ADR 0057). It plays while `active`, on screen and in
 * a visible tab, and never on its own under reduced motion or Save-Data,
 * where the poster frame stands in. Where the browser refuses to start it
 * (iOS Low Power Mode), the same recording loops as a silent image.
 *
 * No button sits on the picture while it plays. The whole clip is the
 * control: a tap or Space pauses it (moving content needs a way to stop,
 * WCAG 2.2.2) and plays it again, and a small "Paused" or "Play" label shows
 * only when it isn't moving.
 *
 * The video sits under its poster at full opacity: phone browsers may not
 * start a video they think is invisible, so the poster fades out over it
 * instead of the video fading in.
 */
import { ArrowClockwiseIcon, PlayIcon } from "@phosphor-icons/react";
import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { FILMS, filmFile, filmLoop, type FilmId } from "@/content/films";
import { filmMotion, shouldPlay } from "./player-logic";
import { SilentLoop } from "./silent-loop";
import { noSubscribe, useOnScreen, usePlaybackLimits, useVideoControl } from "./use-playback";

export function FilmClip({ id, poster, active = true, enabled = true }: { id: FilmId; poster: ReactNode; active?: boolean; enabled?: boolean }) {
  const film = FILMS[id];
  const { reducedMotion, saveData } = usePlaybackLimits();
  const { ref, inView, near, hidden } = useOnScreen<HTMLDivElement>();
  const video = useRef<HTMLVideoElement>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [userPlayed, setUserPlayed] = useState(false);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const source = mounted && enabled ? filmFile(id, "clip", "mp4") : null;
  const loop = mounted && enabled ? filmLoop(id, "clip") : null;
  const want = source !== null && active && shouldPlay({ inView, hidden, reducedMotion, saveData, userPaused, userPlayed });
  const control = useVideoControl(video, want, source);
  const motion = filmMotion({ want, blocked: control.blocked, error: control.error, userPaused });
  // A loop that failed to load leaves the poster and the play button.
  const [loopFailed, setLoopFailed] = useState<string | null>(null);
  const looping = motion === "loop" && loop !== null && loopFailed !== loop;
  const playing = motion === "video" || looping;
  // A failure, or ten seconds of trying without a frame, turns the button into a retry.
  const stuck = control.error || (motion === "video" && control.slow && !control.playing);
  const press = () => {
    if (playing) {
      setUserPaused(true);
      setUserPlayed(false);
      return;
    }
    setUserPaused(false);
    setUserPlayed(true);
    control.start();
  };

  return (
    <div ref={ref} className="relative aspect-[4/3] overflow-hidden bg-canvas">
      {source ? (
        <video
          ref={video}
          className="absolute inset-0 size-full object-cover"
          src={source}
          muted
          loop
          playsInline
          disablePictureInPicture
          // Downloads a screen and a half ahead, so it's ready when it plays or is switched to (ADR 0061).
          preload={near && !reducedMotion && !saveData ? "auto" : "none"}
          aria-hidden
          tabIndex={-1}
        />
      ) : null}
      <div aria-hidden className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${control.shown && !control.error ? "opacity-0" : "opacity-100"}`}>
        {poster}
      </div>
      {looping && source ? <SilentLoop key={loop} mp4={source} webp={loop} fit="cover" onFailed={() => setLoopFailed(loop)} /> : null}
      <p className="sr-only">{film.summary}</p>
      {stuck ? (
        <button
          type="button"
          onClick={control.retry}
          aria-label={`${control.error ? "The clip didn't load" : "The clip is taking a while"}. Try again: ${film.title}`}
          className="absolute bottom-3 right-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm font-medium text-ink shadow-e2 ring-1 ring-line transition-transform duration-200 active:scale-95"
        >
          <ArrowClockwiseIcon size={16} weight="bold" aria-hidden /> Try again
        </button>
      ) : source ? (
        <button
          type="button"
          onClick={press}
          aria-label={`${playing ? "Pause" : "Play"} the clip: ${film.title}`}
          className="group absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          {playing ? null : (
            <span className="absolute bottom-3 right-3 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface/95 px-3 text-sm font-medium text-ink shadow-e2 ring-1 ring-line">
              <PlayIcon size={13} weight="fill" aria-hidden /> {userPaused ? "Paused" : "Play"}
            </span>
          )}
        </button>
      ) : null}
    </div>
  );
}
