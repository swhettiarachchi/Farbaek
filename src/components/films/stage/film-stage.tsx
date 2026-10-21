"use client";

/**
 * The film stage host (ADR 0034). It renders one film at one moment, and
 * hands the recorder `window.__film`: the film's details and `seek(ms)`,
 * which draws that exact frame and resolves once it's painted and every
 * preview frame has loaded. `?play=1` plays it in real time instead, for
 * looking at a film while it's being made.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { FILMS, type FilmFormat, type FilmId, type FilmMeta } from "@/content/films";
import { toVtt } from "../timeline";
import { BuildFilm, ClipFilm, type ClipId } from "./build-film";
import { framesSettled } from "./frames";
import { ProofFilm } from "./proof-film";

declare global {
  interface Window {
    __film?: {
      id: FilmId;
      format: FilmFormat;
      durationMs: number;
      posterAtMs: number;
      size: { width: number; height: number; cssWidth: number; cssHeight: number };
      captionsVtt: string;
      chaptersVtt: string;
      ready: boolean;
      seek: (ms: number) => Promise<void>;
    };
  }
}

const noSubscribe = () => () => {};
const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

export function FilmStage({ id, format, play, start }: { id: FilmId; format: FilmFormat; play: boolean; start: number }) {
  const [t, setT] = useState(start);
  const film: FilmMeta = FILMS[id];

  useEffect(() => {
    window.__film = {
      id,
      format,
      durationMs: film.durationMs,
      posterAtMs: film.posterAtMs,
      size: film.formats[format]!,
      captionsVtt: toVtt(film.chapters, film.durationMs, "caption"),
      chaptersVtt: toVtt(film.chapters, film.durationMs, "label"),
      ready: true,
      seek: async (ms: number) => {
        flushSync(() => setT(ms));
        await framesSettled();
        // Preview frames scroll by message, which they handle on their own turn.
        if (document.querySelector("iframe")) await new Promise((r) => setTimeout(r, 45));
        await nextPaint();
      },
    };
    return () => {
      delete window.__film;
    };
  }, [id, format, film]);

  useEffect(() => {
    if (!play) return;
    let raf = 0;
    const began = performance.now() - start;
    const tick = () => {
      setT((performance.now() - began) % film.durationMs);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, start, film.durationMs]);

  // The stage only renders in the browser: it's a recording tool, and a server render could differ from the first frame by a hair.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!mounted) return null;
  if (id === "build") return <BuildFilm t={t} format={format === "portrait" ? "portrait" : "landscape"} />;
  if (id === "proof") return <ProofFilm t={t} format={format === "portrait" ? "portrait" : "landscape"} />;
  return <ClipFilm id={id as ClipId} t={t} />;
}
