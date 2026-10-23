import { CircleNotchIcon, RobotIcon, UserIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { VERIFICATION_RESULT_WORDS, verificationState, type VerificationRecord } from "@/core/realityloop/verification";
import { RelativeTime } from "@/components/ui/local-time";

/** Who started an attempt, in words: the workspace's autonomy, the person looking, or a teammate. */
function startedBy(v: VerificationRecord, viewerId: string | null): string {
  if (v.trigger === "autonomy") return "on its own, right after the change applied (autonomy level 2)";
  return v.startedBy && v.startedBy === viewerId ? "by you" : "by a teammate";
}

/**
 * The latest attempt to verify an applied change (ADR 0047): checking now,
 * or why the last one couldn't finish. Icon and words, never colour alone.
 */
export function VerificationStatus({ verification: v, viewerId, now }: { verification: VerificationRecord; viewerId: string | null; now: Date }) {
  const state = verificationState(v, now);
  const WhoIcon = v.trigger === "autonomy" ? RobotIcon : UserIcon;

  if (state === "running") {
    return (
      <div role="status" className="flex items-start gap-3 rounded-md border border-accent/30 bg-accent/[0.05] px-4 py-3.5">
        <CircleNotchIcon size={20} weight="bold" className="mt-0.5 shrink-0 text-accent motion-safe:animate-spin" aria-hidden />
        <div className="grid gap-1 text-sm">
          <p className="font-medium text-ink">Checking now</p>
          <p className="text-ink-2">
            A sandbox is preparing the project and running the checks against exactly the applied files. This page updates on its own.
          </p>
          <p className="text-xs text-ink-3">
            <WhoIcon size={14} className="mr-1 inline-block align-[-2px]" aria-hidden /> Started <RelativeTime iso={v.startedAt} />, {startedBy(v, viewerId)}.
          </p>
        </div>
      </div>
    );
  }

  if (state === "failed" || state === "stale") {
    return (
      <div className="flex items-start gap-3 rounded-md border border-approval/30 bg-approval/[0.06] px-4 py-3.5">
        <WarningCircleIcon size={20} weight="bold" className="mt-0.5 shrink-0 text-approval" aria-hidden />
        <div className="grid gap-1 text-sm">
          <p className="font-medium text-ink">The last check run couldn&apos;t finish</p>
          <p className="text-ink-2">{state === "stale" ? "It stopped without finishing, so nothing was recorded." : v.failure}</p>
          <p className="text-xs text-ink-3">
            <WhoIcon size={14} className="mr-1 inline-block align-[-2px]" aria-hidden /> Started <RelativeTime iso={v.startedAt} />, {startedBy(v, viewerId)}. Nothing was verified, and nothing else changed.
          </p>
        </div>
      </div>
    );
  }

  // Done, while the task still waits: the run couldn't check exactly the applied files.
  const words = v.result ? VERIFICATION_RESULT_WORDS[v.result] : VERIFICATION_RESULT_WORDS.unverified;
  return (
    <div className="flex items-start gap-3 rounded-md border border-line bg-surface-sunken px-4 py-3.5">
      <WarningCircleIcon size={20} weight="bold" className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
      <div className="grid gap-1 text-sm">
        <p className="font-medium text-ink">Last check run: {words.title.toLowerCase()}</p>
        <p className="text-ink-2">{words.detail}</p>
        <p className="text-xs text-ink-3">
          <WhoIcon size={14} className="mr-1 inline-block align-[-2px]" aria-hidden /> Started <RelativeTime iso={v.startedAt} />, {startedBy(v, viewerId)}.
        </p>
      </div>
    </div>
  );
}
