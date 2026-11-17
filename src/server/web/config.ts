/**
 * Where live web search runs (stage 205, ADR 0222): the search service and the page reader, both private to Farbaek's server
 * (deploy/vps/compose.yaml sets these). When either is missing, search is off and every answer says the web couldn't be
 * checked; nothing pretends. Server-only.
 */
export interface WebConfig {
  searchUrl: string;
  readerUrl: string;
}

function httpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

export function webConfig(env: Record<string, string | undefined> = process.env): WebConfig | null {
  const searchUrl = httpUrl(env.WEB_SEARCH_URL);
  const readerUrl = httpUrl(env.WEB_READER_URL);
  return searchUrl && readerUrl ? { searchUrl, readerUrl } : null;
}
