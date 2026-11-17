// A page's or a search result's date, checked (stage 205, ADR 0222). Its own module so the app can use it without loading
// the reader's HTML libraries.

/** An ISO date from a page's own words, or null when there's none or it's implausible. */
export function cleanDate(value, now = Date.now()) {
  if (typeof value !== "string" || value.length > 64) return null;
  const t = Date.parse(value.trim());
  if (!Number.isFinite(t)) return null;
  // Not before the web was common, not more than a day in the future.
  if (t < Date.UTC(1995, 0, 1) || t > now + 86_400_000) return null;
  return new Date(t).toISOString();
}
