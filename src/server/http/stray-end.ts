/**
 * A link copied from the end of a sentence often brings its full stop, comma
 * or closing bracket with it: "www.farbaek.com/sign-in/password." landed on
 * "We can't find that page". On the app's own host, a path ending in such
 * punctuation is sent to the same path without it. No Farbaek route ends
 * that way. Published sites and previews never come through here.
 */
const STRAY_END = /[.,;:!)\]]+$/;

/** The path without the punctuation, or null when there's none to remove. */
export function withoutStrayEnd(pathname: string): string | null {
  if (pathname.length < 3 || !STRAY_END.test(pathname)) return null;
  const cleaned = pathname.replace(STRAY_END, "");
  return cleaned.length > 0 && cleaned !== pathname ? cleaned : null;
}
