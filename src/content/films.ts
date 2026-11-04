/**
 * Farbaek's product films (ADR 0034): real screen recordings of Farbaek's
 * interface, shot frame by frame on the film stage (`/film-stage/<id>`,
 * dev only) and encoded to H.264 by `pnpm films:record`. One source for the
 * stage, the recorder, the homepage player, the captions and the tests.
 *
 * Every film shows a sample project. Each capability shown exists in the
 * product today; nothing here is a roadmap item.
 */
import FILM_VERSIONS from "./films-manifest.json";

export type FilmFormat = "landscape" | "portrait" | "clip";

export interface FilmChapter {
  id: string;
  label: string;
  /** Start, in milliseconds from the beginning of the film. */
  start: number;
  /** What happens on screen, said plainly. Shown as the caption and in the transcript. */
  caption: string;
  /** Where to try this part on the homepage, when there's a real place to. */
  tryIt?: { href: string; label: string };
}

export interface FilmMeta {
  id: string;
  title: string;
  /** One sentence for screen readers and the transcript. */
  summary: string;
  durationMs: number;
  /** Recorded frame size per format, in output pixels, and the CSS viewport it's laid out at. */
  formats: Partial<Record<FilmFormat, { width: number; height: number; cssWidth: number; cssHeight: number }>>;
  /** The moment used for the poster image. */
  posterAtMs: number;
  chapters: FilmChapter[];
  /** Plays as a silent loop beside text, without captions or controls. */
  ambient?: boolean;
}

export const FILM_FPS = 30;
export const FILM_LABEL = "Sample project, recorded from Farbaek's interface.";

// Landscape films can go full screen on large displays, so they're filmed at twice their stage size (ADR 0057).
const LANDSCAPE = { width: 2560, height: 1600, cssWidth: 1280, cssHeight: 800 };
const PORTRAIT = { width: 1080, height: 1350, cssWidth: 432, cssHeight: 540 };
const CLIP = { width: 1440, height: 1080, cssWidth: 1024, cssHeight: 768 };

export const FILMS = {
  build: {
    id: "build",
    title: "One build, start to finish",
    summary: "A sample bakery website goes from one sentence to a checked, published and confirmed live site in Farbaek.",
    durationMs: 58_000,
    formats: { landscape: LANDSCAPE, portrait: PORTRAIT },
    posterAtMs: 1_800,
    chapters: [
      { id: "describe", label: "Describe", start: 0, caption: "Describe what you want in one sentence. Farbaek starts a project and drafts a plan.", tryIt: { href: "#hero-title", label: "Try the build box" } },
      { id: "plan", label: "Plan", start: 8_500, caption: "Read the plan: the goal, what must not change and the design. Approve it to start the build.", tryIt: { href: "#showcase", label: "Start from a template" } },
      { id: "build", label: "Build", start: 18_500, caption: "The agent works in the open. Every step shows as it happens, and the preview updates." },
      { id: "check", label: "Check", start: 32_500, caption: "Before anything goes live, a security check reads exactly these files and scores them.", tryIt: { href: "#evidence", label: "See the evidence" } },
      { id: "publish", label: "Publish", start: 40_500, caption: "Publish puts this exact version at its own address. Every version is kept." },
      { id: "live", label: "Live", start: 48_000, caption: "Farbaek opens the address and confirms the live site serves exactly this version." },
    ],
  },
  proof: {
    id: "proof",
    title: "Proof before anything ships",
    summary: "A sample change is reviewed, approved against its exact hash, checked in a sandbox, sealed as a ProofPack and gated before launch.",
    durationMs: 43_000,
    formats: { landscape: LANDSCAPE, portrait: PORTRAIT },
    posterAtMs: 1_800,
    chapters: [
      { id: "review", label: "Review", start: 0, caption: "Review a proposed change file by file. Keep what you want, reject the rest." },
      { id: "approve", label: "Approve", start: 6_500, caption: "Approval binds to a hash of exactly what you saw. Change one character and it stops matching.", tryIt: { href: "#demo", label: "Try it yourself" } },
      { id: "checks", label: "Checks", start: 14_000, caption: "Checks run in a sandbox against the applied files. Exit codes decide, and a check that didn't run says so." },
      { id: "proof", label: "ProofPack", start: 22_500, caption: "A ProofPack records what ran, against which files, and what it doesn't prove.", tryIt: { href: "#evidence", label: "Read a ProofPack" } },
      { id: "gate", label: "Launch gate", start: 29_000, caption: "Publishing needs a clean check of these exact files, then the live check confirms them." },
      { id: "undo", label: "Undo", start: 35_500, caption: "An applied change can be undone, and the undo is recorded too." },
    ],
  },
  "clip-plan": {
    id: "clip-plan",
    title: "A plan you approve",
    summary: "The plan card for a sample bakery site: goal, limits, design and skills, then Approve and build.",
    durationMs: 10_000,
    formats: { clip: CLIP },
    posterAtMs: 2_600,
    ambient: true,
    chapters: [{ id: "plan", label: "Plan", start: 0, caption: "The plan card, with skills chosen for this build." }],
  },
  "clip-agent": {
    id: "clip-agent",
    title: "The agent at work",
    summary: "The agent's steps stream in while the sample bakery site takes shape in the preview.",
    durationMs: 10_000,
    formats: { clip: CLIP },
    posterAtMs: 3_800,
    ambient: true,
    chapters: [{ id: "agent", label: "Agent", start: 0, caption: "Steps stream in as the preview updates." }],
  },
  "clip-check": {
    id: "clip-check",
    title: "Checked before it ships",
    summary: "A security check of the sample site's files scores an A with nothing critical.",
    durationMs: 10_000,
    formats: { clip: CLIP },
    posterAtMs: 4_800,
    ambient: true,
    chapters: [{ id: "check", label: "Check", start: 0, caption: "The security check scores the files." }],
  },
  "clip-live": {
    id: "clip-live",
    title: "Published and confirmed",
    summary: "The sample site is published and Farbaek's live check confirms its address serves exactly this version.",
    durationMs: 10_000,
    formats: { clip: CLIP },
    posterAtMs: 4_400,
    ambient: true,
    chapters: [{ id: "live", label: "Live", start: 0, caption: "Published, then confirmed live." }],
  },
} as const satisfies Record<string, FilmMeta>;

export type FilmId = keyof typeof FILMS;

export function isFilmId(value: unknown): value is FilmId {
  return typeof value === "string" && Object.hasOwn(FILMS, value);
}

/**
 * A recording or track, versioned by its content hash (films-manifest.json,
 * ADR 0051), so it can be cached for a year and still change when re-recorded.
 */
function versioned(path: string): string {
  const v = (FILM_VERSIONS as Record<string, string | undefined>)[path];
  return v ? `/films/${path}?v=${v}` : `/films/${path}`;
}

/** Where a recording lives under /public. Posters go through the image optimiser, so they stay unversioned. */
export function filmFile(id: FilmId, format: FilmFormat, kind: "mp4" | "jpg"): string {
  return kind === "mp4" ? versioned(`${id}/${format}.mp4`) : `/films/${id}/${format}.${kind}`;
}

/**
 * A recording's silent loop: the same film as an animated WebP, shown where a
 * browser won't start the video on its own (scripts/films/loops.mjs, ADR 0056).
 */
export function filmLoop(id: FilmId, format: FilmFormat): string {
  return versioned(`${id}/${format}-loop.webp`);
}

export function filmTrack(id: FilmId, kind: "captions" | "chapters"): string {
  return versioned(`${id}/${kind}.vtt`);
}

/** Size limits per recording, so the homepage stays light. */
export const FILM_BUDGET_BYTES = { landscape: 12_000_000, portrait: 8_000_000, clip: 2_500_000 } as const;

/** Size limits per silent loop. Only browsers that refuse the video download one. */
export const LOOP_BUDGET_BYTES = { landscape: 4_000_000, portrait: 2_500_000, clip: 1_300_000 } as const;
