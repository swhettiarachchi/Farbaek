import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FilmStage } from "@/components/films/stage/film-stage";
import { FILMS, isFilmId, type FilmFormat } from "@/content/films";

export const metadata: Metadata = { title: "Film stage", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Where Farbaek's product films are shot (ADR 0034). Development only: it
 * doesn't exist unless the server runs with FARBAEK_FILM_STAGE=1, which
 * production never sets.
 */
export default async function FilmStagePage({ params, searchParams }: { params: Promise<{ film: string }>; searchParams: Promise<{ format?: string; play?: string; t?: string }> }) {
  if (process.env.FARBAEK_FILM_STAGE !== "1") notFound();
  const { film } = await params;
  if (!isFilmId(film)) notFound();
  const { format: rawFormat, play, t } = await searchParams;
  const formats = Object.keys(FILMS[film].formats) as FilmFormat[];
  const format = formats.includes(rawFormat as FilmFormat) ? (rawFormat as FilmFormat) : formats[0]!;
  const start = Math.max(0, Math.min(FILMS[film].durationMs, Number(t) || 0));
  return (
    <div className="m-0 inline-block">
      <FilmStage id={film} format={format} play={play === "1"} start={start} />
    </div>
  );
}
