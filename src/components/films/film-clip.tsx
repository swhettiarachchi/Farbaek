"use client";

/**
 * A short, silent feature clip that loops beside its text (ADR 0034). It
 * plays only while `active`, on screen, in a visible tab and the page's one
 * playing video (ADR 0051), and never on its own under reduced motion or
 * Save-Data, where the poster frame stands in. A pause button is always
 * there, because moving content needs one; it shows play whenever the clip
 * isn't really playing, so a refused autoplay is one press away.
 *
 * The video sits under its poster at full opacity: phone browsers may not
 * start a video they think is invisible, so the poster fades out over it
 * instead of the video fading in.
 */
import { ArrowClockwiseIcon, PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { FILMS, filmFile, type FilmId } from "@/content/films";
import { shouldPlay } from "./player-logic";
import { noSubscribe, playbackLead, useIsLead, useOnScreen, usePlaybackLimits, useVideoControl } from "./use-playback";

export function FilmClip({ id, poster, active = true, enabled = true }: { id: FilmId; poster: ReactNode; active?: boolean; enabled?: boolean }) {
  const film = FILMS[id];
  const key = useId();
  const { reducedMotion, saveData } = usePlaybackLimits();
  const { ref, inView, hidden } = useOnScreen<HTMLDivElement>(0.3, key);
  const video = useRef<HTMLVideoElement>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [userPlayed, setUserPlayed] = useState(false);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const source = mounted && enabled ? filmFile(id, "clip", "mp4") : null;
  const eligible = source !== null && active && shouldPlay({ inView, hidden, reducedMotion, saveData, userPaused, userPlayed });
  const isLead = useIsLead(key);
  const want = eligible && isLead;
  const control = useVideoControl(video, want, source);

  useEffect(() => {
    playbackLead.report(key, { eligible: eligible && !control.error });
  }, [key, eligible, control.error]);
  useEffect(() => () => playbackLead.leave(key), [key]);

  const playing = want && !control.blocked && !control.error;
  // A failure, or ten seconds of trying without a frame, turns the button into a retry.
  const stuck = control.error || (want && control.slow && !control.playing);
  const press = () => {
    if (playing) {
      setUserPaused(true);
      setUserPlayed(false);
      playbackLead.report(key, { userAt: null });
      return;
    }
    setUserPaused(false);
    setUserPlayed(true);
    playbackLead.report(key, { userAt: Date.now(), eligible: true });
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
          preload="none"
          aria-hidden
          tabIndex={-1}
        />
      ) : null}
      <div aria-hidden className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${control.shown && !control.error ? "opacity-0" : "opacity-100"}`}>
        {poster}
      </div>
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
          className="absolute bottom-3 right-3 inline-flex size-11 items-center justify-center rounded-full bg-surface text-ink shadow-e2 ring-1 ring-line transition-transform duration-200 hover:scale-105 active:scale-95"
        >
          {playing ? <PauseIcon size={16} weight="fill" aria-hidden /> : <PlayIcon size={16} weight="fill" aria-hidden />}
        </button>
      ) : null}
    </div>
  );
}
