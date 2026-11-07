import {
  CheckCircleIcon,
  CircleDashedIcon,
  ClipboardTextIcon,
  EyeIcon,
  FileZipIcon,
  GlobeIcon,
  ImageIcon,
  PaletteIcon,
  PuzzlePieceIcon,
  SealCheckIcon,
  ShieldCheckIcon,
  SteeringWheelIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { CAPABILITIES, CAPABILITY_STATUS_LABEL, type CapabilityStatus } from "@/content/showcase";
import { imageGeneration } from "@/server/ai/image-config";
import { siteDomain } from "@/server/publish/config";
import { previewUnavailableReason, readSandboxConfig } from "@/server/sandbox/config";

const ICONS: Record<string, Icon> = {
  plan: ClipboardTextIcon,
  design: PaletteIcon,
  skills: PuzzlePieceIcon,
  agent: SteeringWheelIcon,
  preview: EyeIcon,
  checks: ShieldCheckIcon,
  proof: SealCheckIcon,
  publish: GlobeIcon,
  bring: FileZipIcon,
  images: ImageIcon,
};

// Status is a word in its colour and border (ADR 0180): a check for what works, a dashed ring for what isn't there yet.
const STATUS: Record<CapabilityStatus, { icon: Icon | null; className: string; pattern: string }> = {
  working: { icon: CheckCircleIcon, className: "text-verified", pattern: "border-solid border-verified/40" },
  "turning-on": { icon: null, className: "text-approval", pattern: "border-solid border-approval/40" },
  "not-yet": { icon: CircleDashedIcon, className: "text-unverified", pattern: "border-dashed border-unverified/50" },
};

export interface CapabilityRow {
  id: string;
  title: string;
  body: string;
  icon: Icon;
  status: CapabilityStatus;
  /** What a capability that's still turning on is waiting for. */
  waiting?: string;
}

/**
 * What every build comes with (the homepage and the app's first screen).
 * Statuses that depend on this deployment (publishing, app previews, image
 * generation) are read from its configuration.
 */
export function capabilityRows(): CapabilityRow[] {
  const status = (s: (typeof CAPABILITIES)[number]["status"]): { status: CapabilityStatus; waiting?: string } =>
    s === "site-domain"
      ? siteDomain()
        ? { status: "working" }
        : { status: "turning-on", waiting: "Waiting for Farbaek's separate domain for people's sites to be connected." }
      : s === "app-previews"
        ? previewUnavailableReason(readSandboxConfig())
          ? { status: "turning-on", waiting: "Waiting for app previews to be connected on Farbaek's server." }
          : { status: "working" }
        : s === "image-generation"
          ? imageGeneration().generator
            ? { status: "working" }
            : { status: "turning-on", waiting: "Waiting for Farbaek's image model to be connected." }
          : { status: s };
  return CAPABILITIES.map((c) => ({ id: c.id, title: c.title, body: c.body, icon: ICONS[c.id] ?? SealCheckIcon, ...status(c.status) }));
}

/** A capability's status in words, icon and border pattern, never by colour alone. */
export function CapabilityStatusPill({ status }: { status: CapabilityStatus }) {
  const S = STATUS[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${S.pattern} ${S.className}`}>
      {S.icon ? <S.icon size={13} weight="bold" aria-hidden /> : null}
      {CAPABILITY_STATUS_LABEL[status]}
    </span>
  );
}
