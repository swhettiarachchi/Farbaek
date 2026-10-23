"use client";

/**
 * The homepage film player (ADR 0034). It plays a real recording of
 * Farbaek's interface on a loop: muted (the films have no sound), whenever
 * it's in sight and the tab is visible, and never on its own under reduced
 * motion or Save-Data. A person's pause stays paused. Where the browser
 * refuses to start it (iOS Low Power Mode), the recording keeps moving as a
 * silent animated loop, with a press away from captions and chapters
 * (ADR 0055). A stall says so after ten seconds with a retry, and a failure
 * offers the transcript.
 *
 * Progress is painted straight onto CSS variables from one animation frame
 * loop, so the scrubber and the chapter rail move smoothly without
 * re-rendering React on every frame. The recording only starts downloading
 * when it first plays (`preload="none"`); until then the poster shows.
 */
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  ClosedCaptioningIcon,
  CornersInIcon,
  CornersOutIcon,
  PauseIcon,
  PlayIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FILMS, FILM_LABEL, filmFile, filmLoop, filmTrack, type FilmChapter, type FilmFormat, type FilmId } from "@/content/films";
import { chapterAt, clock } from "./timeline";
import { chapterFills, chapterTarget, filmMotion, formatFor, keyAction, playerNotice, shouldPlay } from "./player-logic";
import { SilentLoop } from "./silent-loop";
import { DESKTOP_QUERY, useMediaQuery, useOnScreen, usePlaybackLimits, useVideoControl, useWide } from "./use-playback";

/**
 * The stage tilts back and settles flat as it scrolls up into view, the way
 * the films' own camera does. Only on large screens with a mouse: on phones a
 * scroll-linked 3D transform around a playing video costs frames and can
 * leave the video unpainted.
 */
function Rise({ children }: { children: ReactNode }) {
  const desktop = useMediaQuery(DESKTOP_QUERY) === true;
  const reduce = useReducedMotion() || !desktop;
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 60%"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [16, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [56, 0]);
  return (
    <div ref={ref} style={{ perspective: 1800 }}>
      <motion.div style={reduce ? undefined : { rotateX, scale, y, transformOrigin: "50% 0%" }}>{children}</motion.div>
    </div>
  );
}

function ChapterRail({
  chapters,
  active,
  onSeek,
  side,
}: {
  chapters: readonly FilmChapter[];
  active: number;
  onSeek: (ms: number) => void;
  side: "left" | "right";
}) {
  return (
    <>
      {/* Wide screens: a vertical rail with a progress line per chapter. */}
      <ol aria-label="Chapters" className={`hidden lg:grid lg:content-start lg:gap-1 ${side === "left" ? "lg:order-first" : ""}`}>
        {chapters.map((c, i) => {
          const current = i === active;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSeek(c.start)}
                aria-current={current ? "step" : undefined}
                className="group grid min-h-11 w-full grid-cols-[2px_1fr] gap-x-4 rounded-sm py-2 pr-2 text-left"
              >
                <span aria-hidden className="relative overflow-hidden rounded-full bg-line">
                  <span className="absolute inset-0 origin-top bg-accent" style={{ transform: `scaleY(var(--f${i}, 0))` }} />
                </span>
                <span className="flex items-baseline justify-between gap-3">
                  <span className={`font-medium transition-colors duration-200 ${current ? "text-ink" : "text-ink-3 group-hover:text-ink-2"}`}>{c.label}</span>
                  <span className="font-mono text-xs text-ink-3 tabular">{clock(c.start)}</span>
                </span>
              </button>
              {current && c.tryIt ? (
                <a
                  href={c.tryIt.href}
                  className="group/try ml-[18px] mt-1 inline-flex min-h-11 items-center gap-2 rounded-full pr-2 text-sm font-medium text-accent motion-safe:animate-[usage-in_260ms_cubic-bezier(0.16,1,0.3,1)_both]"
                >
                  {c.tryIt.label}
                  <ArrowRightIcon size={14} weight="bold" aria-hidden className="transition-transform duration-200 group-hover/try:translate-x-0.5" />
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* Phones and tablets: chapters as pills under the film. */}
      <ol aria-label="Chapters" className="grid grid-cols-3 gap-2 lg:hidden">
        {chapters.map((c, i) => {
          const current = i === active;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSeek(c.start)}
                aria-current={current ? "step" : undefined}
                className={`relative isolate flex min-h-11 w-full items-center justify-center overflow-hidden rounded-full px-3 text-sm font-medium ring-1 transition-colors duration-200 ${
                  current ? "bg-surface text-ink ring-accent" : "bg-surface text-ink-2 ring-line"
                }`}
              >
                <span aria-hidden className="absolute inset-0 -z-10 origin-left bg-accent/10" style={{ transform: `scaleX(var(--f${i}, 0))` }} />
                {c.label}
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/**
 * A film with its controls, captions, chapter rail and transcript. `poster`
 * is a server-rendered FilmPoster.
 */
export function FilmTheater({ id, poster, rail = "right" }: { id: FilmId; poster: ReactNode; rail?: "left" | "right" }) {
  const film = FILMS[id];
  const chapters: readonly FilmChapter[] = film.chapters;
  const duration = film.durationMs;
  const formats = Object.keys(film.formats) as FilmFormat[];

  const wide = useWide();
  const { reducedMotion, saveData } = usePlaybackLimits();
  const { ref: screenRef, inView, hidden } = useOnScreen<HTMLDivElement>();
  const format = wide === null ? null : formatFor(formats, wide);
  const source = format ? filmFile(id, format, "mp4") : null;
  const loop = format ? filmLoop(id, format) : null;

  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const seekInput = useRef<HTMLInputElement>(null);
  const timeLabel = useRef<HTMLSpanElement>(null);
  const transcript = useRef<HTMLDetailsElement>(null);

  const [userPaused, setUserPaused] = useState(false);
  const [userPlayed, setUserPlayed] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [active, setActive] = useState(0);

  const want = format !== null && shouldPlay({ inView, hidden, reducedMotion, saveData, userPaused, userPlayed });
  const control = useVideoControl(video, want, source);
  const motion = filmMotion({ want, blocked: control.blocked, error: control.error, userPaused });
  // A loop that failed to load leaves the poster and the play cover.
  const [loopFailed, setLoopFailed] = useState<string | null>(null);
  const looping = motion === "loop" && loop !== null && loopFailed !== loop;
  // The poster steps aside once a frame is drawn, and comes back if the recording fails.
  const started = control.shown && !control.error;
  const captionId = useId();

  /** Paints the time onto the scrubber, the rail and the clock. Called from the frame loop and from video events. */
  const paint = useCallback(() => {
    const v = video.current;
    const el = root.current;
    if (!v || !el) return;
    const t = Math.min(duration, v.currentTime * 1000);
    chapterFills(chapters, duration, t).forEach((p, i) => el.style.setProperty(`--f${i}`, p.toFixed(4)));
    const { index, chapter } = chapterAt(chapters, t);
    if (seekInput.current) {
      seekInput.current.value = String(Math.round(t));
      seekInput.current.setAttribute("aria-valuetext", `${clock(t)} of ${clock(duration)}, ${chapter.label}`);
    }
    if (timeLabel.current) timeLabel.current.textContent = clock(t);
    setActive(index);
  }, [chapters, duration]);

  // The frame loop runs only while the film plays.
  useEffect(() => {
    if (!control.playing) return;
    let raf = 0;
    const tick = () => {
      paint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [control.playing, paint]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // A press plays inside the gesture, so phones that refused to start it on their own still do.
  const play = () => {
    setUserPaused(false);
    setUserPlayed(true);
    if (control.error || control.slow) control.retry();
    else control.start();
  };
  const pause = () => {
    setUserPaused(true);
    setUserPlayed(false);
  };
  // The silent loop counts as playing: pause stops it, and play starts the film itself.
  const playing = motion === "video" || looping;
  const toggle = () => (playing ? pause() : play());

  const seekTo = (ms: number, start = false) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration - 100, ms)) / 1000;
    paint();
    if (start) play();
  };

  const toggleFullscreen = () => {
    const el = frame.current;
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el?.requestFullscreen) void el.requestFullscreen();
    // iPhone Safari only takes a video full screen; its own player shows the captions track.
    else if (v?.webkitEnterFullscreen) {
      const track = v.textTracks[0];
      if (track) track.mode = captions ? "showing" : "hidden";
      v.webkitEnterFullscreen();
    }
  };

  const openTranscript = () => {
    const d = transcript.current;
    if (!d) return;
    d.open = true;
    d.querySelector("summary")?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    // Buttons and the scrubber keep their own keys.
    if (target.tagName === "INPUT" && e.key.startsWith("Arrow")) return;
    if (target.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
    const action = keyAction(e.key);
    if (!action) return;
    e.preventDefault();
    const t = (video.current?.currentTime ?? 0) * 1000;
    if (action.kind === "toggle") toggle();
    else if (action.kind === "seek") seekTo(t + action.byMs);
    else if (action.kind === "chapter") seekTo(chapterTarget(chapters, t, action.step));
    else if (action.kind === "captions") setCaptions((c) => !c);
    else toggleFullscreen();
  };

  const caption = chapters[active]!;
  // The big play button shows only under reduced motion or Save-Data, or where neither the film nor its loop will play.
  const refusedWithoutLoop = control.blocked && !looping && !userPaused;
  const showPlayCover = !started && !control.error && (refusedWithoutLoop || (!userPlayed && (reducedMotion || saveData)));
  const notice = playerNotice({ want, playing: control.playing, blocked: control.blocked, slow: control.slow, error: control.error });

  return (
    <div
      ref={root}
      className={`grid gap-5 lg:gap-10 ${
        rail === "left"
          ? "lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[16.5rem_minmax(0,1fr)]"
          : "lg:grid-cols-[minmax(0,1fr)_15rem] xl:grid-cols-[minmax(0,1fr)_16.5rem]"
      }`}
    >
      <figure className={`m-0 min-w-0 ${rail === "left" ? "lg:order-last" : ""}`}>
        <div className="aurora">
          <Rise>
            <div
              ref={frame}
              className="rounded-lg bg-surface-raised/60 p-1.5 shadow-e3 ring-1 ring-line sm:p-2 [&:fullscreen]:flex [&:fullscreen]:flex-col [&:fullscreen]:justify-center [&:fullscreen]:rounded-none [&:fullscreen]:bg-canvas [&:fullscreen]:p-6"
            >
              {/* Keys work anywhere in the player: on the film, the scrubber or a control. */}
              <div onKeyDown={onKeyDown} className="overflow-hidden rounded-md bg-surface ring-1 ring-line/70 [:fullscreen_&]:mx-auto [:fullscreen_&]:w-full [:fullscreen_&]:max-w-[calc((100dvh-10rem)*1.6)]">
                <div
                  ref={screenRef}
                  role="group"
                  tabIndex={0}
                  aria-roledescription="film"
                  aria-label={`${film.title}. ${FILM_LABEL}`}
                  aria-keyshortcuts="Space K ArrowLeft ArrowRight J L C F"
                  aria-describedby={captionId}
                  className={`relative bg-canvas outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${
                    formats.includes("portrait") ? "aspect-[4/5] sm:aspect-[16/10]" : "aspect-[16/10]"
                  }`}
                >
                  {/* The video sits under the poster at full opacity: phones may not start a video they think is hidden. */}
                  {format && source ? (
                    <video
                      key={format}
                      ref={video}
                      className="absolute inset-0 size-full object-contain"
                      src={source}
                      muted
                      loop
                      playsInline
                      disablePictureInPicture
                      preload="none"
                      aria-hidden
                      tabIndex={-1}
                      onLoadedData={paint}
                      onSeeked={paint}
                    >
                      <track kind="captions" src={filmTrack(id, "captions")} srcLang="en" label="English" />
                      <track kind="chapters" src={filmTrack(id, "chapters")} srcLang="en" label="Chapters" />
                    </video>
                  ) : null}

                  <div aria-hidden className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${started ? "opacity-0" : "opacity-100"}`}>
                    {poster}
                  </div>

                  {looping ? <SilentLoop src={loop} fit="contain" onFailed={() => setLoopFailed(loop)} /> : null}

                  {showPlayCover ? (
                    <button
                      type="button"
                      onClick={play}
                      className="group absolute inset-0 flex items-center justify-center"
                      aria-label={`Play the film, ${clock(duration)}`}
                    >
                      <span className="inline-flex min-h-14 items-center gap-3 rounded-full bg-surface py-2 pl-2 pr-5 text-[15px] font-medium text-ink shadow-e3 ring-1 ring-line transition-transform duration-200 group-hover:scale-[1.03] group-active:scale-[0.98]">
                        <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary text-on-primary">
                          <PlayIcon size={16} weight="fill" aria-hidden />
                        </span>
                        Play the film
                        <span className="font-mono text-xs text-ink-3 tabular">{clock(duration)}</span>
                      </span>
                    </button>
                  ) : null}

                  {notice === "loading" ? (
                    <p className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-xs text-ink-2 shadow-e1 ring-1 ring-line" role="status">
                      <span aria-hidden className="size-1.5 rounded-full bg-accent motion-safe:animate-pulse" />
                      Loading the film
                    </p>
                  ) : null}

                  {notice === "slow" ? (
                    <div className="absolute inset-x-3 top-3 flex flex-wrap items-center justify-end gap-2" role="status">
                      <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-xs text-ink-2 shadow-e1 ring-1 ring-line">
                        <span aria-hidden className="size-1.5 rounded-full bg-approval" />
                        This is taking longer than usual
                      </p>
                      <button
                        type="button"
                        onClick={play}
                        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-on-primary shadow-e2"
                      >
                        <ArrowClockwiseIcon size={16} weight="bold" aria-hidden /> Try again
                      </button>
                    </div>
                  ) : null}

                  {notice === "error" ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-canvas/80 p-4" role="alert">
                      <div className="max-w-xs rounded-md bg-surface p-5 text-center shadow-e2 ring-1 ring-line">
                        <WarningCircleIcon size={22} weight="bold" aria-hidden className="mx-auto text-failed" />
                        <p className="mt-2 font-medium text-ink">The film couldn&apos;t load.</p>
                        <p className="mt-1 text-sm text-ink-2">Check your connection and try again, or read what happens in it.</p>
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                          <button type="button" onClick={play} className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-on-primary">
                            Try again
                          </button>
                          <button type="button" onClick={openTranscript} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-ink ring-1 ring-line">
                            Read what happens
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Captions and controls. The films are silent, so the captions say what happens. */}
                <div className="border-t border-line px-3 pb-2 pt-3 sm:px-4">
                  {looping ? (
                    <p id={captionId} className="flex min-h-[2.75rem] flex-wrap items-center gap-x-3 text-[15px] leading-snug text-ink-2">
                      Playing as a silent loop.
                      <button type="button" onClick={play} className="inline-flex min-h-11 items-center gap-1.5 rounded-full font-medium text-accent">
                        <ClosedCaptioningIcon size={18} weight="fill" aria-hidden /> Play with captions
                      </button>
                    </p>
                  ) : captions ? (
                    <p id={captionId} className="min-h-[2.75rem] text-[15px] leading-snug text-ink" aria-hidden>
                      <span className="mr-2 text-[13px] font-medium text-accent">{caption.label}</span>
                      {caption.caption}
                    </p>
                  ) : (
                    <p id={captionId} className="sr-only">
                      {film.summary}
                    </p>
                  )}

                  <div className="mt-1 flex flex-wrap items-center gap-x-1 sm:flex-nowrap sm:gap-x-2">
                    <button
                      type="button"
                      onClick={toggle}
                      aria-label={playing ? "Pause" : "Play"}
                      aria-keyshortcuts="Space K"
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-raised"
                    >
                      {playing ? <PauseIcon size={18} weight="fill" aria-hidden /> : <PlayIcon size={18} weight="fill" aria-hidden />}
                    </button>
                    <p className="shrink-0 font-mono text-xs text-ink-3 tabular">
                      <span ref={timeLabel}>0:00</span> / {clock(duration)}
                    </p>

                    {/* The scrubber: one segment per chapter, with a native range input on top for touch, mouse and keys. */}
                    <div className="relative order-first flex h-11 w-full items-center sm:order-none sm:mx-2 sm:w-auto sm:flex-1">
                      <input
                        ref={seekInput}
                        type="range"
                        min={0}
                        max={duration}
                        step={100}
                        defaultValue={0}
                        aria-label="Seek"
                        onInput={(e) => seekTo(Number(e.currentTarget.value))}
                        className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                      />
                      <div aria-hidden className="flex w-full gap-[3px] rounded-full peer-hover:[&>span]:h-1.5 peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-4 peer-focus-visible:ring-offset-surface">
                        {chapters.map((c, i) => (
                          <span
                            key={c.id}
                            className="relative h-1 overflow-hidden rounded-full bg-line transition-[height] duration-150"
                            style={{ flexGrow: (chapters[i + 1]?.start ?? duration) - c.start, flexBasis: 0 }}
                          >
                            <span className="absolute inset-0 origin-left bg-accent" style={{ transform: `scaleX(var(--f${i}, 0))` }} />
                          </span>
                        ))}
                      </div>
                    </div>

                    <span className="ml-auto flex shrink-0 sm:ml-0">
                      <button
                        type="button"
                        onClick={() => setCaptions((c) => !c)}
                        aria-pressed={captions}
                        aria-label="Captions"
                        aria-keyshortcuts="C"
                        className={`inline-flex size-11 items-center justify-center rounded-full transition-colors hover:bg-surface-raised ${captions ? "text-ink" : "text-ink-3"}`}
                      >
                        <ClosedCaptioningIcon size={20} weight={captions ? "fill" : "regular"} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        aria-label={fullscreen ? "Exit full screen" : "Full screen"}
                        aria-keyshortcuts="F"
                        className="inline-flex size-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-raised"
                      >
                        {fullscreen ? <CornersInIcon size={18} weight="bold" aria-hidden /> : <CornersOutIcon size={18} weight="bold" aria-hidden />}
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Rise>
        </div>

        <figcaption className="mt-4 flex flex-col gap-2 text-sm text-ink-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <span>{FILM_LABEL} No sound.</span>
          <details ref={transcript} className="group sm:max-w-md sm:text-right">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
              Read what happens
            </summary>
            <ol className="mt-2 grid gap-2 text-left text-ink-2">
              {chapters.map((c) => (
                <li key={c.id}>
                  <span className="font-mono text-xs text-ink-3 tabular">{clock(c.start)}</span> <span className="font-medium text-ink">{c.label}.</span> {c.caption}
                </li>
              ))}
            </ol>
          </details>
        </figcaption>
      </figure>

      <ChapterRail chapters={chapters} active={active} onSeek={(ms) => seekTo(ms, true)} side={rail} />
    </div>
  );
}
