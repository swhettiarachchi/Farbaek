import { SectionHeading } from "@/components/marketing/section-heading";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { FILMS, type FilmId } from "@/content/films";
import { FeatureFilms, type Feature } from "./feature-films";
import { FilmPoster } from "./film-poster";
import { FilmTheater } from "./film-theater";

// The primary films sit in the container's main column: about 880px wide on desktop.
const THEATER_SIZES = { sizes: "calc(100vw - 2rem)", wideSizes: "(min-width: 1280px) 880px, (min-width: 1024px) 72vw, 100vw" };

/** "44 seconds", "1 min 12 s". */
function lengthWords(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m === 0 ? `${s} seconds` : s === 0 ? `${m} min` : `${m} min ${s} s`;
}

function FilmMeta({ id }: { id: FilmId }) {
  const film = FILMS[id];
  return (
    <p className="shrink-0 text-sm text-ink-3">
      {lengthWords(film.durationMs)}, {film.chapters.length} chapters. Silent, with captions.
    </p>
  );
}

/** Directly below the hero: the whole build, recorded from Farbaek's interface. */
export function ProductFilmSection() {
  return (
    <section id="film" aria-labelledby="film-title" className="scroll-mt-20 pb-20 pt-6 lg:pb-28">
      <Container>
        <div className="mb-10 flex flex-col gap-4 lg:mb-14 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          <SectionHeading id="film-title" title="Watch one build, start to finish.">
            A sample café site goes from one sentence to a checked, published and confirmed live address. Recorded from Farbaek&apos;s interface, with the waits shortened.
          </SectionHeading>
          <FilmMeta id="build" />
        </div>
        <FilmTheater id="build" poster={<FilmPoster id="build" {...THEATER_SIZES} />} />
      </Container>
    </section>
  );
}

const FEATURES: Omit<Feature, "poster">[] = [
  {
    id: "clip-plan",
    label: "Plan",
    title: "A plan you approve before any code.",
    points: [
      "The goal, what must not change and the design, in plain words.",
      "Skills picked for this build, and an estimate of how much of your AI usage it will take.",
      "Nothing is built until you approve it.",
    ],
    link: { href: "#showcase", label: "Start from a template" },
  },
  {
    id: "clip-agent",
    label: "Build",
    title: "An agent that works in the open.",
    points: [
      "Every step shows as it happens: reading, writing and checking.",
      "The preview updates while the site takes shape.",
      "Message the agent while it runs, or stop the run.",
    ],
    link: { href: "#film", label: "Watch the whole build" },
  },
  {
    id: "clip-check",
    label: "Check",
    title: "Checked before it can go live.",
    points: [
      "Farbaek's security rules read every file.",
      "Packages are checked for known vulnerabilities, and an AI reviews the riskiest files.",
      "Publishing needs a check of exactly these files that found nothing critical.",
    ],
    link: { href: "#evidence", label: "See the evidence" },
  },
  {
    id: "clip-live",
    label: "Publish",
    title: "Published, then confirmed live.",
    points: [
      "Publish puts this exact version at its own address.",
      "Every version is kept, and any earlier one can be made live again.",
      "Farbaek opens the address and confirms it serves exactly this version.",
    ],
    link: { href: "/pricing", label: "Compare plans" },
  },
];

/** Four parts of the same build, up close. */
export function FeatureFilmsSection() {
  const features: Feature[] = FEATURES.map((f) => ({ ...f, poster: <FilmPoster id={f.id} sizes="(min-width: 1024px) 640px, calc(100vw - 2rem)" /> }));
  return (
    <section aria-labelledby="features-title" className="py-20 lg:py-28">
      <Container>
        <SectionHeading id="features-title" title="What it does for you.">
          Four moments from the same build, up close. Each clip is recorded from Farbaek with a sample project.
        </SectionHeading>
        <FeatureFilms features={features} />
      </Container>
    </section>
  );
}

/** How a change is proven before it ships. Keeps the #how-it-works anchor. */
export function ProofFilmSection() {
  return (
    <section id="how-it-works" aria-labelledby="proof-film-title" className="py-20 lg:py-28">
      <Container>
        <div className="mb-10 flex flex-col gap-4 lg:mb-14 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          <SectionHeading id="proof-film-title" title="Proof before anything ships.">
            A change is reviewed, approved against a hash of exactly what you saw, checked in a sandbox and sealed with what it proves and what it doesn&apos;t.
          </SectionHeading>
          <FilmMeta id="proof" />
        </div>
        <FilmTheater id="proof" rail="left" poster={<FilmPoster id="proof" {...THEATER_SIZES} />} />
        <div className="mt-10 flex flex-wrap gap-3 border-t border-line pt-6">
          <ButtonLink href="#demo" variant="secondary" size="sm">
            Try the approval yourself
          </ButtonLink>
          <ButtonLink href="#evidence" variant="ghost" size="sm">
            Read a ProofPack
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
