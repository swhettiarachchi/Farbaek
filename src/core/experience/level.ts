/**
 * How much of Farbaek a person wants on screen (stage 285, ADR 0293): Standard, Advanced or Professional.
 *
 * A level only chooses what the menus show. It never decides what a person may do: that is the server's, by their role and
 * their plan. A page a level leaves out of the menus still opens by its address and from search, and the page a person is
 * on is always in its menu.
 *
 * The choice is a cookie, like the look's (theme.ts), so the server's first paint already has the right menus.
 */
export type Level = "standard" | "advanced" | "professional";

/** In order: each level shows everything the one before it does. */
export const LEVELS: readonly Level[] = ["standard", "advanced", "professional"];
export const DEFAULT_LEVEL: Level = "standard";

export const LEVEL_COOKIE = "fb_level";
const YEAR_SECONDS = 31_536_000;

export function isLevel(value: unknown): value is Level {
  return typeof value === "string" && (LEVELS as readonly string[]).includes(value);
}

/** The saved choice, from the cookie's value. Anything else is Standard: a cookie is the browser's to send, so it is checked. */
export function readLevel(saved: string | null | undefined): Level {
  return isLevel(saved) ? saved : DEFAULT_LEVEL;
}

/** The choice in a browser's own cookie text ("a=1; fb_level=advanced"), or null. The first cookie of that name counts. */
export function levelInCookies(cookies: string): Level | null {
  const first = cookies.split("; ").find((part) => part.startsWith(`${LEVEL_COOKIE}=`));
  const value = first?.slice(LEVEL_COOKIE.length + 1);
  return isLevel(value) ? value : null;
}

/** The cookie that keeps a choice for a year, on every page of this site. */
export function levelCookie(level: Level, secure: boolean): string {
  return `${LEVEL_COOKIE}=${level}; path=/; max-age=${YEAR_SECONDS}; samesite=lax${secure ? "; secure" : ""}`;
}

function rank(level: Level | undefined): number {
  return Math.max(0, LEVELS.indexOf(level ?? DEFAULT_LEVEL));
}

/** Whether something first shown at `from` is on screen at `level`. With no `from`, it is there for everyone. */
export function shows(level: Level, from?: Level): boolean {
  return rank(level) >= rank(from);
}

/** Chat lists the models to choose from at Advanced and above. At Standard, Farbaek AI picks who answers. */
export function choosesModel(level: Level): boolean {
  return shows(level, "advanced");
}

/** A thing in a menu, and the level it first appears at. */
export interface Levelled {
  from?: Level;
}

/**
 * What a level lists, in the menu's own order, and what it leaves for a higher one. `keep` names what is listed whatever the
 * level: the page a person is on, so nobody stands on a page their menu doesn't show.
 */
export function atLevel<T extends Levelled>(items: readonly T[], level: Level, keep?: (item: T) => boolean): { rows: T[]; hidden: T[] } {
  const rows: T[] = [];
  const hidden: T[] = [];
  for (const item of items) (shows(level, item.from) || keep?.(item) ? rows : hidden).push(item);
  return { rows, hidden };
}

export const LEVEL_WORDS: Record<Level, { name: string; about: string }> = {
  standard: { name: "Standard", about: "The essentials. Farbaek AI picks the model for each question." },
  advanced: { name: "Advanced", about: "Adds the tools for building, and your choice of model in Chat." },
  professional: { name: "Professional", about: "Everything, with the rules, the records and who can do what." },
};

/** The levels that list what this one leaves out, as words: "Advanced and Professional". Empty when nothing is left out. */
export function levelsThatShow(hidden: readonly Levelled[]): string {
  const names = LEVELS.filter((level) => hidden.some((item) => (item.from ?? DEFAULT_LEVEL) === level)).map((level) => LEVEL_WORDS[level].name);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** One plain line for what a level leaves out: "8 more are shown at Advanced and Professional." Empty when nothing is. */
export function hiddenLine(hidden: readonly Levelled[]): string {
  if (hidden.length === 0) return "";
  return `${hidden.length} more ${hidden.length === 1 ? "is" : "are"} shown at ${levelsThatShow(hidden)}.`;
}
