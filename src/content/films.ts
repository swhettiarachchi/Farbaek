/**
 * Farbaek's product films (ADR 0034): real screen recordings of Farbaek's
 * interface, shot frame by frame on the film stage (`/film-stage/<id>`,
 * dev only) and encoded to H.264 by `pnpm films:record`. One source for the
 * stage, the recorder, the homepage player, the captions and the tests.
 *
 * Every film shows a sample project. Each capability shown exists in the
 * product today; nothing here is a roadmap item.
 */

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

const LANDSCAPE = { width: 1920, height: 1200, cssWidth: 1280, cssHeight: 800 };
const PORTRAIT = { width: 1080, height: 1350, cssWidth: 432, cssHeight: 540 };
const CLIP = { width: 1440, height: 1080, cssWidth: 1024, cssHeight: 768 };

export const FILMS = {
  build: {
    id: "build",
    title: "One build, start to finish",
    summary: "A sample café website goes from one sentence to a checked, published and confirmed live site in Farbaek.",
    durationMs: 54_000,
    formats: { landscape: LANDSCAPE, portrait: PORTRAIT },
    posterAtMs: 24_500,
    chapters: [
      { id: "describe", label: "Describe", start: 0, caption: "Describe what you want in one sentence. Farbaek starts a project and drafts a plan.", tryIt: { href: "#hero-title", label: "Try the build box" } },
      { id: "plan", label: "Plan", start: 8_000, caption: "Read the plan: the goal, what must not change and the design. Approve it to start the build.", tryIt: { href: "#showcase", label: "Start from a template" } },
      { id: "build", label: "Build", start: 17_000, caption: "The agent works in the open. Every step shows as it happens, and the preview updates." },
      { id: "check", label: "Check", start: 31_000, caption: "Before anything goes live, a security check reads exactly these files and scores them.", tryIt: { href: "#evidence", label: "See the evidence" } },
      { id: "publish", label: "Publish", start: 39_000, caption: "Publish puts this exact version at its own address. Every version is kept." },
      { id: "live", label: "Live", start: 46_000, caption: "Farbaek opens the address and confirms the live site serves exactly this version." },
    ],
  },
  proof: {
    id: "proof",
    title: "Proof before anything ships",
    summary: "A sample change is reviewed, approved against its exact hash, checked in a sandbox, sealed as a ProofPack and gated before launch.",
    durationMs: 32_000,
    formats: { landscape: LANDSCAPE, portrait: PORTRAIT },
    posterAtMs: 22_000,
    chapters: [
      { id: "review", label: "Review", start: 0, caption: "Review a proposed change file by file. Keep what you want, reject the rest." },
      { id: "approve", label: "Approve", start: 6_000, caption: "Approval binds to a hash of exactly what you saw. Change one character and it stops matching.", tryIt: { href: "#demo", label: "Try it yourself" } },
      { id: "checks", label: "Checks", start: 12_000, caption: "Checks run in a sandbox against the applied files. Exit codes decide, and a check that didn't run says so." },
      { id: "proof", label: "ProofPack", start: 19_000, caption: "A ProofPack records what ran, against which files, and what it doesn't prove.", tryIt: { href: "#evidence", label: "Read a ProofPack" } },
      { id: "gate", label: "Launch gate", start: 25_000, caption: "Publishing needs a clean check of these exact files, then the live check confirms them." },
      { id: "undo", label: "Undo", start: 29_000, caption: "An applied change can be undone, and the undo is recorded too." },
    ],
  },
  "clip-plan": {
    id: "clip-plan",
    title: "A plan you approve",
    summary: "The plan card for a sample café site: goal, limits, design and skills, then Approve and build.",
    durationMs: 10_000,
    formats: { clip: CLIP },
    posterAtMs: 6_000,
    ambient: true,
    chapters: [{ id: "plan", label: "Plan", start: 0, caption: "The plan card, with skills chosen for this build." }],
  },
  "clip-agent": {
    id: "clip-agent",
    title: "The agent at work",
    summary: "The agent's steps stream in while the sample café site takes shape in the preview.",
    durationMs: 10_000,
    formats: { clip: CLIP },
    posterAtMs: 7_000,
    ambient: true,
    chapters: [{ id: "agent", label: "Agent", start: 0, caption: "Steps stream in as the preview updates." }],
  },
  "clip-check": {
    id: "clip-check",
    title: "Checked before it ships",
    summary: "A security check of the sample site's files scores an A with nothing critical.",
    durationMs: 10_000,
    formats: { clip: CLIP },
    posterAtMs: 7_500,
    ambient: true,
    chapters: [{ id: "check", label: "Check", start: 0, caption: "The security check scores the files." }],
  },
  "clip-live": {
    id: "clip-live",
    title: "Published and confirmed",
    summary: "The sample site is published and Farbaek's live check confirms its address serves exactly this version.",
    durationMs: 10_000,
    formats: { clip: CLIP },
    posterAtMs: 8_000,
    ambient: true,
    chapters: [{ id: "live", label: "Live", start: 0, caption: "Published, then confirmed live." }],
  },
} as const satisfies Record<string, FilmMeta>;

export type FilmId = keyof typeof FILMS;

export function isFilmId(value: unknown): value is FilmId {
  return typeof value === "string" && Object.hasOwn(FILMS, value);
}

/** Where a recording lives under /public. */
export function filmFile(id: FilmId, format: FilmFormat, kind: "mp4" | "jpg"): string {
  return `/films/${id}/${format}.${kind}`;
}

export function filmTrack(id: FilmId, kind: "captions" | "chapters"): string {
  return `/films/${id}/${kind}.vtt`;
}

/** Size limits per recording, so the homepage stays light. */
export const FILM_BUDGET_BYTES = { landscape: 6_000_000, portrait: 5_000_000, clip: 1_200_000 } as const;
