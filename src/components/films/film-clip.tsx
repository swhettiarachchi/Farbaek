"use client";

/**
 * A short, silent feature clip that loops beside its text (ADR 0034). It
 * plays only while `active`, on screen and in a visible tab, and never on
 * its own under reduced motion or Save-Data, where the poster frame stands
 * in. A pause button is always there, because moving content needs one.
 */
import { PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { FILMS, filmFile, type FilmId } from "@/content/films";
import { shouldPlay } from "./player-logic";
import { noSubscribe, useOnScreen, usePlaybackLimits } from "./use-playback";

export function FilmClip({ id, poster, active = true }: { id: FilmId; poster: ReactNode; active?: boolean }) {
  const film = FILMS[id];
  const { reducedMotion, saveData } = usePlaybackLimits();
  const { ref, inView, hidden } = useOnScreen<HTMLDivElement>(0.3);
  const video = useRef<HTMLVideoElement>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [userPlayed, setUserPlayed] = useState(false);
  const [shown, setShown] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const want = mounted && active && !failed && shouldPlay({ inView, hidden, reducedMotion, saveData, userPaused, userPlayed });

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (want) v.play().catch(() => {});
    else v.pause();
  }, [want]);

  return (
    <div ref={ref} className="relative aspect-[4/3] overflow-hidden bg-canvas">
      <div aria-hidden className={`absolute inset-0 transition-opacity duration-500 ${shown ? "opacity-0" : "opacity-100"}`}>
        {poster}
      </div>
      {mounted ? (
        <video
          ref={video}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${shown ? "opacity-100" : "opacity-0"}`}
          src={filmFile(id, "clip", "mp4")}
          muted
          loop
          playsInline
          disablePictureInPicture
          preload="none"
          aria-hidden
          tabIndex={-1}
          onLoadedData={() => setShown(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
      <p className="sr-only">{film.summary}</p>
      {failed ? null : (
        <button
          type="button"
          onClick={() => {
            if (want) {
              setUserPaused(true);
              setUserPlayed(false);
            } else {
              setUserPaused(false);
              setUserPlayed(true);
            }
          }}
          aria-label={`${want ? "Pause" : "Play"} the clip: ${film.title}`}
          className="absolute bottom-3 right-3 inline-flex size-11 items-center justify-center rounded-full bg-surface/90 text-ink shadow-e2 ring-1 ring-line backdrop-blur transition-transform duration-200 hover:scale-105 active:scale-95"
        >
          {want ? <PauseIcon size={16} weight="fill" aria-hidden /> : <PlayIcon size={16} weight="fill" aria-hidden />}
        </button>
      )}
    </div>
  );
}
