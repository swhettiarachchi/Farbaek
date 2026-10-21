"use client";

import { ClockCountdownIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { buttonClasses } from "@/components/ui/button";

/**
 * Warns before an idle office session ends (WCAG 2.2.1: at least 20
 * seconds ahead, with a simple way to stay). The server decides when a
 * session ends; this only counts down from the last request it saw.
 */
export function IdleWarning({ lastSeenAt, idleMinutes, warnSeconds, stayActive }: { lastSeenAt: string; idleMinutes: number; warnSeconds: number; stayActive: () => Promise<{ lastSeenAt: string } | null> }) {
  // The newest of the server's last-seen time and the one "Stay signed in" returned.
  const [stayed, setStayed] = useState<string | null>(null);
  const seen = stayed && stayed > lastSeenAt ? stayed : lastSeenAt;
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const deadline = new Date(seen).getTime() + idleMinutes * 60_000;
  const left = Math.max(0, Math.round((deadline - now) / 1000));

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (left === 0) router.replace("/sign-in?ended=1");
  }, [left, router]);

  if (left > warnSeconds) return null;
  return (
    <div role="alertdialog" aria-labelledby="idle-title" aria-describedby="idle-body" className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-md border border-approval/40 bg-surface p-5 shadow-e3 lg:bottom-6">
      <p id="idle-title" className="flex items-center gap-2 font-medium">
        <ClockCountdownIcon size={18} weight="bold" className="text-approval" aria-hidden /> Still there?
      </p>
      <p id="idle-body" className="mt-1.5 text-sm text-ink-2">
        You&apos;ll be signed out in <span className="font-mono tabular">{left}</span> seconds to keep the office safe.
      </p>
      <button
        type="button"
        autoFocus
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await stayActive();
            if (r) setStayed(r.lastSeenAt);
          })
        }
        className={buttonClasses("primary", "sm", "mt-4")}
      >
        Stay signed in
      </button>
    </div>
  );
}
