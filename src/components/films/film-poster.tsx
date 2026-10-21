import { getImageProps } from "next/image";
import { FILMS, filmFile, type FilmFormat, type FilmId } from "@/content/films";
import { WIDE_QUERY } from "./player-logic";

type Size = { width: number; height: number };

/**
 * A film's poster frame, served through the image optimiser as AVIF or WebP
 * at the size the screen needs. Films with a portrait cut swap to it on
 * phones, matching the recording the player loads (art direction with
 * `<picture>`). It renders on the server, so the frame is there before any
 * script runs and the player has no layout shift.
 */
export function FilmPoster({ id, sizes, wideSizes, eager = false }: { id: FilmId; sizes: string; wideSizes?: string; eager?: boolean }) {
  const formats = FILMS[id].formats as Partial<Record<FilmFormat, Size>>;
  const image = (format: FilmFormat, size: Size, sz: string) =>
    getImageProps({ src: filmFile(id, format, "jpg"), alt: "", width: size.width, height: size.height, sizes: sz, loading: eager ? "eager" : "lazy" }).props;

  const className = "absolute inset-0 size-full object-cover";
  if (formats.clip) {
    const props = image("clip", formats.clip, sizes);
    // eslint-disable-next-line @next/next/no-img-element -- the props come from getImageProps, so it's still optimised
    return <img {...props} alt="" className={className} />;
  }
  const narrow = formats.portrait ?? formats.landscape!;
  const fallback = image(formats.portrait ? "portrait" : "landscape", narrow, sizes);
  const wide = formats.landscape ? image("landscape", formats.landscape, wideSizes ?? sizes) : null;
  return (
    <picture>
      {wide ? <source media={WIDE_QUERY} srcSet={wide.srcSet} sizes={wide.sizes} /> : null}
      <img {...fallback} alt="" className={className} />
    </picture>
  );
}
