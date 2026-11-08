import {
  BookOpenTextIcon,
  BrowserIcon,
  ClipboardTextIcon,
  FileZipIcon,
  GlobeIcon,
  HammerIcon,
  ImageIcon,
  ListChecksIcon,
  PaletteIcon,
  SealCheckIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { StatusBadge, type Status } from "@/components/ui/status-badge";
import { CAPABILITIES, CAPABILITY_STATUS_LABEL, type CapabilityStatus } from "@/content/showcase";
import { imageGeneration } from "@/server/ai/image-config";
import { siteDomain } from "@/server/publish/config";
import { previewUnavailableReason, readSandboxConfig } from "@/server/sandbox/config";

const ICONS: Record<string, Icon> = {
  plan: ClipboardTextIcon,
  design: PaletteIcon,
  skills: BookOpenTextIcon,
  agent: HammerIcon,
  preview: BrowserIcon,
  checks: ListChecksIcon,
  proof: SealCheckIcon,
  publish: GlobeIcon,
  bring: FileZipIcon,
  images: ImageIcon,
};

// Each status is one of the shared kinds (ADR 0183): its words, icon, colour and border together.
const STATUS_KIND: Record<CapabilityStatus, Status> = {
  working: "verified",
  "turning-on": "pending",
  "not-yet": "unverified",
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
        : { status: "turning-on", waiting: "Not available yet." }
      : s === "app-previews"
        ? previewUnavailableReason(readSandboxConfig())
          ? { status: "turning-on", waiting: "Not available yet." }
          : { status: "working" }
        : s === "image-generation"
          ? imageGeneration().generator
            ? { status: "working" }
            : { status: "turning-on", waiting: "Not available yet." }
          : { status: s };
  return CAPABILITIES.map((c) => ({ id: c.id, title: c.title, body: c.body, icon: ICONS[c.id] ?? SealCheckIcon, ...status(c.status) }));
}

/** A capability's status as its kind: the words, its icon, colour and border, never colour alone. */
export function CapabilityStatusPill({ status }: { status: CapabilityStatus }) {
  return <StatusBadge status={STATUS_KIND[status]} label={CAPABILITY_STATUS_LABEL[status]} />;
}
