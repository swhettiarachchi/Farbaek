/**
 * The Farbaek media library and Farbaek Scenes (ADR 0156): what the agent
 * may put in a build without the person supplying anything. Every file was
 * rendered by Farbaek from its own scenes (scripts/media/record.mjs), so
 * it's free to use in any site Farbaek builds. They live under a versioned
 * path that never changes, because published sites point at them.
 */

/**
 * Where the kit and the library are served. Published sites load them from
 * here. A local build can point it at itself with NEXT_PUBLIC_KIT_ORIGIN;
 * anything that isn't a bare origin is ignored.
 */
export const MEDIA_ORIGIN = ((): string => {
  const v = process.env.NEXT_PUBLIC_KIT_ORIGIN?.trim();
  return v && /^https?:\/\/[a-z0-9.-]+(:\d{2,5})?$/i.test(v) ? v : "https://www.farbaek.com";
})();
export const KIT_URL = `${MEDIA_ORIGIN}/kit/scenes/v1/scenes.js`;
export const MEDIA_BASE = `${MEDIA_ORIGIN}/media/v1`;

export const SCENE_NAMES = ["aurora", "glass", "particles", "horizon", "orb", "gallery"] as const;
export type SceneName = (typeof SCENE_NAMES)[number];

/** What each scene is, for the agent's prompt and Studio's picker. */
export const SCENE_DESCRIPTIONS: Record<SceneName, string> = {
  aurora: "curtains of northern light over a night sky (or soft pastel light on a light page)",
  glass: "a slowly turning glass knot that bends the light and lines behind it",
  particles: "thousands of glowing points that breathe from a sphere into a ring",
  horizon: "a futuristic line landscape flowing towards a glowing horizon",
  orb: "a pearl planet with a soft atmosphere, fine rings and two moons",
  gallery: "the section's own images floating on a curved arc",
};

export const COLOURWAYS = {
  signal: { tone: "dark", base: "#0a0f1f", colors: ["#2450f0", "#22d3ee", "#e8eefc"], words: "deep navy with blue and cyan" },
  ember: { tone: "dark", base: "#140b10", colors: ["#ff8a3d", "#ff4d6d", "#ffe9d6"], words: "near-black plum with amber and rose" },
  pearl: { tone: "light", base: "#f4f6fa", colors: ["#5b7bd5", "#7cc6dc", "#1d2433"], words: "pale pearl with soft blue and aqua" },
} as const;
export type Colourway = keyof typeof COLOURWAYS;

/** The scenes the library has recordings of (gallery needs the site's own images, so it has none). */
export const RECORDED_SCENES = ["aurora", "glass", "particles", "horizon", "orb"] as const satisfies readonly SceneName[];

export const LIBRARY_FILES = ["loop.mp4", "still-16x9.webp", "still-4x5.webp"] as const;
export type LibraryFile = (typeof LIBRARY_FILES)[number];

export interface LibraryItem {
  id: string;
  scene: (typeof RECORDED_SCENES)[number];
  colourway: Colourway;
  tone: "dark" | "light";
  /** What it shows, for alt text and the picker. */
  alt: string;
}

export const MEDIA_LIBRARY: readonly LibraryItem[] = RECORDED_SCENES.flatMap((scene) =>
  (Object.keys(COLOURWAYS) as Colourway[]).map((colourway) => ({
    id: `${scene}-${colourway}`,
    scene,
    colourway,
    tone: COLOURWAYS[colourway].tone,
    alt: `Abstract ${scene} artwork in ${COLOURWAYS[colourway].words}`,
  })),
);

export function libraryItem(id: string): LibraryItem | null {
  return MEDIA_LIBRARY.find((i) => i.id === id) ?? null;
}

export function mediaUrl(id: string, file: LibraryFile): string {
  return `${MEDIA_BASE}/${id}/${file}`;
}

/** Whether a URL is one of the library's own files. */
export function isLibraryUrl(url: string): boolean {
  if (!url.startsWith(`${MEDIA_BASE}/`)) return false;
  const [id, file, ...rest] = url.slice(MEDIA_BASE.length + 1).split("/");
  return rest.length === 0 && libraryItem(id ?? "") !== null && (LIBRARY_FILES as readonly string[]).includes(file ?? "");
}

/** How many images, videos and scenes in a site's pages still stand in for the person's own (data-farbaek-placeholder). */
export function placeholderCount(files: readonly { path: string; content: string }[]): number {
  return files.filter((f) => /\.html?$/i.test(f.path)).reduce((n, f) => n + (f.content.match(/<[a-z][a-z0-9-]*\b[^>]*\sdata-farbaek-placeholder\b/gi)?.length ?? 0), 0);
}

/** The library as the agent reads it: one line per item, plus the URL pattern. */
export function libraryForPrompt(): string {
  const lines = MEDIA_LIBRARY.map((i) => `- ${i.id}: ${SCENE_DESCRIPTIONS[i.scene]}, in ${COLOURWAYS[i.colourway].words} (${i.tone})`);
  return [
    `Files for each item, at ${MEDIA_BASE}/<id>/: loop.mp4 (1280x720, a seamless 10 s silent loop, about 1.5 MB), still-16x9.webp (1600x900) and still-4x5.webp (1080x1350).`,
    ...lines,
  ].join("\n");
}
