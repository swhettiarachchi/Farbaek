/**
 * The picture beside a story (stage 278, ADR 0285). Framework-free.
 *
 * A source may carry the address of one picture: the one its own page names for previews (its `og:image`), or the small one the
 * news search gave with the result. The browser never loads that address. It asks Farbaek for it, Farbaek's page reader fetches
 * it under the same rules as a page (public addresses only, a size and a time limit, pictures only), and the screen shows what
 * comes back. So opening an answer tells no other site who is reading it, and an address a page wrote can't make the browser
 * call anything.
 *
 * Farbaek fetches only addresses it chose itself: each one saved with an answer carries a short signature made on the server,
 * and the picture is given only for an address whose signature is right.
 */

/** The longest picture address kept, in UTF-8 bytes: longer ones are left out, not cut (a cut address is another address). */
export const PICTURE_URL_BYTES = 400;

/** The kinds of picture the reader passes on. Never SVG, which can carry script, and never GIF, which is usually moving. */
export const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

/** The most bytes of one picture, counted after decompression. A page's preview picture is usually a third of this or less. */
export const PICTURE_MAX_BYTES = 1_000_000;

/**
 * A picture address worth keeping, or null: https only, no user name or password, a host with a dot in it, short enough to
 * save, and resolved against the page it was found on when it is relative. Whether the host is public is checked where it is
 * fetched, on every address it resolves to; this is only what can be told from the text.
 */
export function pictureUrl(raw: unknown, base?: string): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text.length > 2_000 || /^data:/i.test(text)) return null;
  let url: URL;
  try {
    url = base ? new URL(text, base) : new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;
  if (!url.hostname.includes(".") || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":")) return null;
  url.hash = "";
  const out = url.toString();
  return new TextEncoder().encode(out).length <= PICTURE_URL_BYTES ? out : null;
}

/** A signature as the server makes one: 27 URL-safe characters. Anything else is refused before it is compared. */
export const PICTURE_SIG_PATTERN = /^[A-Za-z0-9_-]{27}$/;

/** Where the screen asks Farbaek for a source's picture. */
export const PICTURE_PATH = "/app/chat/api/picture";

/** The address the screen loads for a picture, or null when the source has none it may load. */
export function pictureSrc(source: { image?: string | null; imageSig?: string | null }): string | null {
  if (!source.image || !source.imageSig || !PICTURE_SIG_PATTERN.test(source.imageSig)) return null;
  return `${PICTURE_PATH}?u=${encodeURIComponent(source.image)}&s=${source.imageSig}`;
}

/** A day as a story shows it: "25 Nov 2026". Empty when the date can't be read. */
export function storyDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
