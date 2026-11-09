import { HammerIcon, UserIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";
import { VERIFICATION_RESULT_WORDS, verificationState, type VerificationRecord, type VerificationResult } from "@/core/realityloop/verification";
import { RelativeTime } from "@/components/ui/local-time";
import { StatusGlyph, type Status } from "@/components/ui/status-badge";

/** Who started an attempt, in words: the workspace's autonomy, the person looking, or a teammate. */
function startedBy(v: VerificationRecord, viewerId: string | null): string {
  if (v.trigger === "autonomy") return "on its own, right after the change applied";
  return v.startedBy && v.startedBy === viewerId ? "by you" : "by a teammate";
}

/** The "Started" line, with who started it as an icon too: a person, or the agent working on its own. */
function Started({ v, viewerId, children }: { v: VerificationRecord; viewerId: string | null; children?: ReactNode }) {
  const WhoIcon = v.trigger === "autonomy" ? HammerIcon : UserIcon;
  return (
    <p className="flex items-start gap-1.5 text-xs text-ink-3">
      <WhoIcon size={14} weight="bold" className="mt-px shrink-0" aria-hidden />
      <span>
        Started <RelativeTime iso={v.startedAt} />, {startedBy(v, viewerId)}.{children}
      </span>
    </p>
  );
}

// Each state sits on the neutral notice surface; its icon's colour says what kind it is (ADR 0183).
const NOTICE = "flex items-start gap-2.5 rounded-sm border border-line bg-surface-raised/70 px-4 py-3";

// A finished run the task can't count yet, as a kind: anything short of verified needs its own mark.
const RESULT_KIND: Record<VerificationResult, Status> = {
  verified: "verified",
  partially_verified: "attention",
  failed: "failed",
  unverified: "unverified",
};

/**
 * The latest attempt to verify an applied change (ADR 0047): checking now,
 * or why the last one couldn't finish. Icon and words, never colour alone.
 */
export function VerificationStatus({ verification: v, viewerId, now }: { verification: VerificationRecord; viewerId: string | null; now: Date }) {
  const state = verificationState(v, now);

  if (state === "running") {
    return (
      <div role="status" className={NOTICE}>
        <StatusGlyph status="working" size={16} className="mt-0.5" />
        <div className="grid gap-1 text-sm">
          <p className="font-medium text-ink">Checking now</p>
          <p className="text-ink-2">
            A test space is preparing the project and running the checks against exactly the applied files. This page updates on its own.
          </p>
          <Started v={v} viewerId={viewerId} />
        </div>
      </div>
    );
  }

  if (state === "failed" || state === "stale") {
    return (
      <div className={NOTICE}>
        <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
        <div className="grid gap-1 text-sm">
          <p className="font-medium text-ink">The last check run couldn&apos;t finish</p>
          <p className="text-ink-2">{state === "stale" ? "It stopped without finishing, so nothing was recorded." : v.failure}</p>
          <Started v={v} viewerId={viewerId}> Nothing was verified, and nothing else changed.</Started>
        </div>
      </div>
    );
  }

  // Done, while the task still waits: the run couldn't check exactly the applied files.
  const result: VerificationResult = v.result ?? "unverified";
  const words = VERIFICATION_RESULT_WORDS[result];
  return (
    <div className={NOTICE}>
      <StatusGlyph status={RESULT_KIND[result]} size={16} className="mt-0.5" />
      <div className="grid gap-1 text-sm">
        <p className="font-medium text-ink">Last check run: {words.title.toLowerCase()}</p>
        <p className="text-ink-2">{words.detail}</p>
        <Started v={v} viewerId={viewerId} />
      </div>
    </div>
  );
}
