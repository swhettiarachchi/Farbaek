import {
  CheckCircleIcon,
  CircleDashedIcon,
  ClipboardTextIcon,
  EyeIcon,
  FileZipIcon,
  GlobeIcon,
  HourglassMediumIcon,
  ImageIcon,
  PaletteIcon,
  PuzzlePieceIcon,
  RobotIcon,
  SealCheckIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { CAPABILITIES, CAPABILITY_STATUS_LABEL, type CapabilityStatus } from "@/content/showcase";
import { siteDomain } from "@/server/publish/config";
import { previewUnavailableReason, readSandboxConfig } from "@/server/sandbox/config";
import { imageGeneration } from "@/server/ai/image-config";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Showroom } from "./showroom";

const ICONS: Record<string, Icon> = {
  plan: ClipboardTextIcon,
  design: PaletteIcon,
  skills: PuzzlePieceIcon,
  agent: RobotIcon,
  preview: EyeIcon,
  checks: ShieldCheckIcon,
  proof: SealCheckIcon,
  publish: GlobeIcon,
  bring: FileZipIcon,
  images: ImageIcon,
};

const STATUS: Record<CapabilityStatus, { icon: Icon; className: string; pattern: string }> = {
  working: { icon: CheckCircleIcon, className: "text-verified", pattern: "border-solid border-verified/40" },
  "turning-on": { icon: HourglassMediumIcon, className: "text-approval", pattern: "border-solid border-approval/40" },
  "not-yet": { icon: CircleDashedIcon, className: "text-unverified", pattern: "border-dashed border-unverified/50" },
};

/**
 * "What you can build": the homepage showroom of concept mockups (ADR 0031),
 * and what Farbaek does around the design. Statuses that depend on this
 * deployment (publishing, app previews, image generation) are read from its configuration.
 */
export function ShowcaseSection() {
  const status = (s: (typeof CAPABILITIES)[number]["status"]): CapabilityStatus =>
    s === "site-domain" ? (siteDomain() ? "working" : "turning-on") : s === "app-previews"
        ? previewUnavailableReason(readSandboxConfig())
          ? "turning-on"
          : "working"
        : s === "image-generation"
          ? imageGeneration().generator
            ? "working"
            : "turning-on"
          : s;

  return (
    <section id="showcase" aria-labelledby="showcase-title" className="overflow-x-clip py-20 lg:py-28">
      <Container>
        <SectionHeading id="showcase-title" title="Start from something like these.">
          Eight concepts, each with its own look, motion and purpose, the way Farbaek designs every build. Pick one and start a build like it.
        </SectionHeading>

        <div className="mt-12">
          <Showroom />
        </div>

        <p className="mt-6 max-w-[64ch] text-sm text-ink-3">
          Concept mockups drawn for this page. They show the kind of thing you can ask for; none of them is a live product.
        </p>

        <div className="mt-16 border-t border-line pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h3 className="max-w-[24ch] text-balance text-[1.6rem] font-medium leading-tight tracking-[-0.03em] sm:text-[1.9rem]">What every build comes with.</h3>
            <Link href="#status" className="inline-flex min-h-11 items-center text-sm font-medium text-ink-2 hover:text-ink">
              See what works today
            </Link>
          </div>
          <ul className="mt-8 grid gap-x-10 md:grid-cols-2">
            {CAPABILITIES.map((c) => {
              const s = status(c.status);
              const S = STATUS[s];
              const CapIcon = ICONS[c.id] ?? SealCheckIcon;
              return (
                <li key={c.id} className="flex gap-4 border-t border-line py-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/[0.08] text-accent">
                    <CapIcon size={20} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h4 className="text-[16px] font-medium tracking-[-0.01em]">{c.title}</h4>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${S.pattern} ${S.className}`}>
                        <S.icon size={13} weight="bold" aria-hidden />
                        {CAPABILITY_STATUS_LABEL[s]}
                      </span>
                    </div>
                    <p className="mt-1 text-[14.5px] leading-relaxed text-ink-2">{c.body}</p>
                    {s === "turning-on" ? <p className="mt-1 text-xs text-ink-3">Waiting for Farbaek&apos;s separate domain for people&apos;s sites to be connected.</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Container>
    </section>
  );
}
