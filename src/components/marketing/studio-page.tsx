import {
  ArrowUpRightIcon,
  ClockCounterClockwiseIcon,
  CropIcon,
  DownloadSimpleIcon,
  FilmStripIcon,
  ImagesIcon,
  LockKeyIcon,
  PenNibIcon,
  SlidersHorizontalIcon,
  SpeakerHighIcon,
  StackIcon,
  SwatchesIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Reveal } from "@/components/motion/reveal";
import { space, spaceStart } from "@/components/site/spaces";
import { Container } from "@/components/ui/container";
import { BEZEL } from "@/components/ui/surfaces";
import { LEAD, PART_TITLE, PUBLIC_TITLE, SECTION_TITLE } from "@/components/ui/titles";
import { IMAGE_STYLES, VIDEO_STYLES } from "@/core/studio/studio";
import { ImagesWindow, VideoWindow } from "./tour-windows";
import { OtherSpaces } from "./other-spaces";

type Feature = { icon: Icon; title: string; body: string };

const IMAGE_FEATURES: Feature[] = [
  { icon: SwatchesIcon, title: "Styles with a brief behind them", body: "Photograph, product shot, portrait, architecture, food, illustration, 3D render and film still: each adds the light, lens and finish a professional would choose." },
  { icon: CropIcon, title: "Seven shapes", body: "Square, portrait, tall, story, landscape, wide and cinema, each made at its own size rather than cropped." },
  { icon: SlidersHorizontalIcon, title: "Detail when it matters", body: "Draft to try ideas fast, Standard for most pictures, High and Ultra for fine texture and finals." },
  { icon: ImagesIcon, title: "Work from your own pictures", body: "Add up to four of your photos or earlier results to edit one, keep a subject, or follow a style." },
  { icon: StackIcon, title: "Up to four at once", body: "Each picture shows a first look while it's made, then lands in your library." },
  { icon: PenNibIcon, title: "Refine with Farbaek AI", body: "Turn a few words into the brief an art director would write, and read it before anything is made." },
  { icon: LockKeyIcon, title: "Private to you", body: "Your library is yours in your workspace. Nobody else sees it, and it goes with you if you leave." },
  { icon: DownloadSimpleIcon, title: "Download and share", body: "PNG with transparency, WebP or JPEG. Files are named and marked as AI-made." },
];

const VIDEO_FEATURES: Feature[] = [
  { icon: FilmStripIcon, title: "From a sentence or a picture", body: "Describe a scene, or start from one of your pictures and say how it should move." },
  { icon: SpeakerHighIcon, title: "With sound", body: "Ambience, music or dialogue come with the picture, steered by your words." },
  { icon: CropIcon, title: "Wide or vertical", body: "16:9 for screens and sites, 9:16 for stories and reels, from 4 to 10 seconds." },
  { icon: SlidersHorizontalIcon, title: "Draft to high quality", body: "Draft at 360p to try an idea, Standard at 720p, High upscaled to 1080p." },
  { icon: SwatchesIcon, title: "Styles", body: "Cinematic, documentary, product film, animation, a dithered print look, or a conversation between two people." },
  { icon: PenNibIcon, title: "Refine with Farbaek AI", body: "Farbaek AI writes the shot like a cinematographer: action, camera, light and sound, for you to read first." },
  { icon: ClockCounterClockwiseIcon, title: "Keeps rendering if you leave", body: "A video takes a minute or two. Close the page and it still lands in your library." },
  { icon: LockKeyIcon, title: "Private, and marked as AI-made", body: "Your videos are yours in your workspace, and each carries the model's invisible AI-made watermark." },
];

/** A studio's public page (stage 201, ADR 0216): what it makes, how it works, and the way in. */
export function StudioPage({ kind }: { kind: "images" | "video" }) {
  const s = space(kind);
  const image = kind === "images";
  const features = image ? IMAGE_FEATURES : VIDEO_FEATURES;
  const styles = image ? IMAGE_STYLES.filter((x) => x.id !== "none") : VIDEO_STYLES.filter((x) => x.id !== "none");
  return (
    <>
      <section aria-labelledby="studio-title" className="relative overflow-hidden">
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-0" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[40rem]"
          style={{ background: "radial-gradient(46% 42% at 50% 30%, color-mix(in oklab, var(--color-accent) 9%, transparent), transparent 75%)" }}
        />
        <Container className="relative pb-12 pt-10 sm:pb-16 sm:pt-16 lg:pt-20">
          <Reveal className="mx-auto flex max-w-[48rem] flex-col items-center text-center">
            <BrandLogo height={64} className="h-14 w-auto sm:h-16" />
            <h1 id="studio-title" className={`mt-5 ${PUBLIC_TITLE}`}>
              {image ? "Pictures with studio light and finish." : "Short films with sound, from a sentence."}
            </h1>
            <p className={`mt-5 max-w-[36rem] text-ink-2 ${LEAD}`}>
              {image
                ? "Describe what you want, choose a style and a shape, and Farbaek AI makes it the way a photographer, designer or illustrator would. Edit your own photos the same way."
                : "Describe a scene or start from one of your pictures. Farbaek AI films it with sound, wide or vertical, and keeps it in your library."}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2 sm:mt-9">
              <Link
                href={spaceStart(s)}
                className="group inline-flex h-11 items-center gap-2 rounded-full bg-primary pl-5 pr-1.5 text-sm font-medium text-on-primary shadow-e1 transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary-hover active:scale-[0.98]"
              >
                {s.open}
                <span className="flex size-8 items-center justify-center rounded-full bg-on-primary/15 transition-transform duration-300 group-hover:-translate-y-px group-hover:translate-x-0.5">
                  <ArrowUpRightIcon size={16} weight="bold" aria-hidden />
                </span>
              </Link>
              <Link href="/pricing" className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink transition-colors duration-200 hover:bg-surface-raised">
                See the plans
              </Link>
            </div>
          </Reveal>
          <Reveal delay={0.12} className="mx-auto mt-14 max-w-[64rem] sm:mt-20">
            <div className="aspect-[16/11] w-full sm:aspect-[16/10]">{image ? <ImagesWindow /> : <VideoWindow />}</div>
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="studio-features" className="py-14 sm:py-20 lg:py-28">
        <Container>
          <div className="mx-auto max-w-[44rem] text-center">
            <h2 id="studio-features" className={SECTION_TITLE}>
              {image ? "Made like a professional would." : "Directed, not just generated."}
            </h2>
            <p className={`mt-3 text-ink-2 sm:mt-4 ${LEAD}`}>
              {image
                ? "Every picture is asked for coherent light, true materials, right hands and faces, and no watermark of its own. The style adds the rest."
                : "Each video is described the way a film crew would hear it: what happens, how the camera moves, the light and the sound."}
            </p>
          </div>
          <ul className="mx-auto mt-10 grid max-w-[72rem] gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: FeatureIcon, title, body }) => (
              <li key={title} className="rounded-md border border-line bg-surface p-5 shadow-e1">
                <span className="flex size-10 items-center justify-center rounded-full bg-canvas-2 text-ink-2 ring-1 ring-line">
                  <FeatureIcon size={20} aria-hidden />
                </span>
                <h3 className="mt-4 text-title-4 font-medium tracking-[-0.01em]">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="studio-styles" className="pb-14 sm:pb-20 lg:pb-28">
        <Container>
          <div className={BEZEL}>
            <div className="rounded-md bg-surface px-5 py-8 sm:px-10 sm:py-12">
              <h2 id="studio-styles" className={`text-center ${PART_TITLE}`}>
                The briefs behind the styles
              </h2>
              <p className="mx-auto mt-2 max-w-[40rem] text-center text-sm leading-relaxed text-ink-2">Each style adds these words after yours. Your words lead; the brief sets the craft.</p>
              <dl className="mx-auto mt-8 grid max-w-[60rem] gap-x-10 gap-y-5 sm:grid-cols-2">
                {styles.map((st) => (
                  <div key={st.id}>
                    <dt className="text-sm font-medium text-ink">{st.label}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-ink-2">{st.brief}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <p className="mx-auto mt-6 max-w-[56ch] text-center text-sm leading-relaxed text-ink-2">
            {image ? "Pictures" : "Videos"} use your plan&apos;s AI usage, like everything Farbaek AI does, with a daily limit per person so one session can&apos;t use it all.
          </p>
        </Container>
      </section>

      <OtherSpaces current={kind} />
    </>
  );
}
