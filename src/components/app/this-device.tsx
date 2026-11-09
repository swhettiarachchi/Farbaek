"use client";

import { BellIcon, BellRingingIcon, BellSlashIcon, CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { removePushAction, savePushAction, testPushAction, type PushState } from "@/app/app/push-actions";
import { CardTitle } from "@/components/app/primitives";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { RelativeTime } from "@/components/ui/local-time";

type Support = "unsupported" | "install_first" | "ready";
const noSubscribe = () => () => undefined;

function readSupport(): Support {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "ready";
  // Safari on iPhone offers notifications only to sites added to the Home Screen.
  return ios && !standalone ? "install_first" : "unsupported";
}

const readPermission = () => ("Notification" in window ? Notification.permission : "default");

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export interface DeviceRow {
  endpoint: string;
  label: string;
  createdAt: string;
  lastSentAt: string | null;
}

/**
 * Notifications on this device (ADR 0079): turn them on, send a test, or
 * turn them off, and see every device that gets them. On an iPhone they
 * need Farbaek on the Home Screen first, and the card says how.
 */
export function ThisDevice({ vapidKey, devices, disabledReason }: { vapidKey: string | null; devices: DeviceRow[]; disabledReason: string | null }) {
  const support = useSyncExternalStore(noSubscribe, readSupport, () => "unsupported" as Support);
  const permission = useSyncExternalStore(noSubscribe, readPermission, () => "default" as NotificationPermission);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [result, setResult] = useState<PushState | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (support !== "ready") return;
    let alive = true;
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => {
        if (alive) setEndpoint(sub?.endpoint ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [support]);

  const reason = disabledReason ?? (vapidKey ? null : "Notifications aren't set up on this server yet.");
  const on = endpoint !== null && devices.some((d) => d.endpoint === endpoint);

  const turnOn = () =>
    startTransition(async () => {
      setResult(null);
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        if ((await Notification.requestPermission()) !== "granted") {
          setResult({ ok: false, message: "Notifications are blocked for Farbaek in this browser. Allow them in the browser's site settings, then try again." });
          return;
        }
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey!) });
        const keys = sub.toJSON().keys ?? {};
        const r = await savePushAction({ endpoint: sub.endpoint, p256dh: keys.p256dh ?? "", auth: keys.auth ?? "" });
        if (r.ok) setEndpoint(sub.endpoint);
        else await sub.unsubscribe().catch(() => undefined);
        setResult(r);
      } catch {
        setResult({ ok: false, message: "Notifications couldn't be turned on here. Try again." });
      }
    });

  const turnOff = (target: string) =>
    startTransition(async () => {
      if (target === endpoint) {
        const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
        const sub = await reg?.pushManager.getSubscription().catch(() => null);
        await sub?.unsubscribe().catch(() => undefined);
        setEndpoint(null);
      }
      setResult(await removePushAction(target));
    });

  const test = () => startTransition(async () => setResult(await testPushAction()));

  return (
    <div className="grid gap-5">
      <div>
        <CardTitle icon={BellIcon}>This device</CardTitle>
        <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-ink-2">
          Get a notification here when a build you started finishes, or a change&apos;s checks end. Each device you turn it on for gets them, and you can turn any of them off.
        </p>
      </div>

      {support === "install_first" ? (
        <p className="rounded-sm border border-line bg-surface-raised/60 px-4 py-3 text-sm leading-relaxed text-ink-2">
          On iPhone and iPad, add Farbaek to your Home Screen first: tap Share, then Add to Home Screen. Open Farbaek from there, then turn notifications on here.
        </p>
      ) : support === "unsupported" ? (
        <p className="text-sm text-ink-3">This browser can&apos;t show notifications from websites.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {on ? (
            <>
              <StatusBadge status="verified" label="On here" />
              <button type="button" onClick={test} disabled={pending || Boolean(reason)} className={buttonClasses("secondary", "sm")}>
                <BellRingingIcon size={16} weight="bold" aria-hidden /> Send a test
              </button>
              <button type="button" onClick={() => turnOff(endpoint!)} disabled={pending} className={buttonClasses("ghost", "sm")}>
                <BellSlashIcon size={16} weight="bold" aria-hidden /> Turn off here
              </button>
            </>
          ) : (
            <button type="button" onClick={turnOn} disabled={pending || Boolean(reason) || permission === "denied"} className={buttonClasses("primary", "sm")}>
              <BellRingingIcon size={16} weight="bold" aria-hidden /> {pending ? "Turning on…" : "Turn on notifications here"}
            </button>
          )}
          {reason ? <span className="text-sm text-ink-3">{reason}</span> : permission === "denied" && !on ? <span className="text-sm text-ink-3">Blocked in this browser&apos;s site settings.</span> : null}
        </div>
      )}

      {result ? (
        <p role={result.ok ? "status" : "alert"} className={`flex items-start gap-2 text-sm ${result.ok ? "text-verified" : "text-failed"}`}>
          {result.ok ? (
            <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
          ) : (
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          )}
          <span>{result.message}</span>
        </p>
      ) : null}

      {devices.length > 0 ? (
        <ul className="grid divide-y divide-line rounded-md border border-line">
          {devices.map((d) => (
            <li key={d.endpoint} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{d.label}</span>
                {d.endpoint === endpoint ? <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs text-ink-2">This device</span> : null}
                <span className="block text-xs text-ink-3">
                  On since <RelativeTime iso={d.createdAt} />
                  {d.lastSentAt ? (
                    <>
                      , last notified <RelativeTime iso={d.lastSentAt} />
                    </>
                  ) : null}
                  .
                </span>
              </span>
              {d.endpoint !== endpoint ? (
                <button type="button" onClick={() => turnOff(d.endpoint)} disabled={pending} className={buttonClasses("ghost", "sm")}>
                  Turn off
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
