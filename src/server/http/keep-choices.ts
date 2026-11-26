/**
 * Keeps a person's choices of look and of level for the year they were told (stage 285, ADR 0293).
 *
 * Both are cookies the browser's own script writes when a choice is pressed, so the page turns at once. Safari, and every
 * browser on an iPhone, keeps a cookie written by script for seven days at most, whatever life it asks for. A cookie the
 * server sends is not cut short. So when a page of the signed-in app is opened carrying one of these cookies, the response
 * sends it back unchanged with a year's life.
 *
 * Only a value that is one of the known choices is sent back: nothing a browser made up is ever put into a header.
 */
import { LEVEL_COOKIE, isLevel } from "@/core/experience/level";
import { THEME_COOKIE, isTheme } from "@/core/theme/theme";

const YEAR_SECONDS = 31_536_000;

export interface KeptChoice {
  name: string;
  value: string;
  /** Readable by the page's script, as it was: the choice control reads it. */
  options: { path: "/"; maxAge: number; sameSite: "lax"; secure: boolean; httpOnly: false };
}

const KEPT: readonly { name: string; known: (value: unknown) => boolean }[] = [
  { name: THEME_COOKIE, known: isTheme },
  { name: LEVEL_COOKIE, known: isLevel },
];

/** The choices a request carries, each to be sent back for a year. `read` gives a cookie's value by its name. */
export function choicesToKeep(read: (name: string) => string | undefined, secure: boolean): KeptChoice[] {
  const kept: KeptChoice[] = [];
  for (const { name, known } of KEPT) {
    const value = read(name);
    if (typeof value === "string" && known(value)) kept.push({ name, value, options: { path: "/", maxAge: YEAR_SECONDS, sameSite: "lax", secure, httpOnly: false } });
  }
  return kept;
}

/**
 * Whether a request is a browser loading a page afresh: opening Farbaek, a new tab, a reload.
 *
 * Only then, never for a request a page itself makes (the app's own moves between pages, streams, uploads, API calls). A
 * page that is open can change the choice while its own request is still on its way, and an answer carrying the older
 * value would then put it back. A page being loaded afresh has no control on it to press yet.
 */
export function opensPage(method: string, header: (name: string) => string | null): boolean {
  if (method !== "GET") return false;
  const mode = header("sec-fetch-mode");
  if (mode) return mode === "navigate";
  return (header("accept") ?? "").includes("text/html");
}
