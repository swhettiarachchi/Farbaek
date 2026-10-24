"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { CONTACT } from "@/config/contact";

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Cloudflare asks for this exact URL, unproxied and uncached.
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile didn't start")));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("Turnstile didn't load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Cloudflare Turnstile in the sign-in form (ADR 0067). Most people never see
 * it: it only appears when it needs a click. Its token goes into the form as
 * `captchaToken`, and Supabase Auth checks it with Cloudflare. A token works
 * once, so the check resets whenever the server answers (`resetSignal`).
 */
export function TurnstileCheck({ siteKey, resetSignal }: { siteKey: string; resetSignal: unknown }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [problem, setProblem] = useState<"load" | "check" | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTurnstile().then(
      (api) => {
        if (cancelled || !box.current) return;
        widget.current = api.render(box.current, {
          sitekey: siteKey,
          action: "sign-in",
          theme: "light",
          size: "flexible",
          appearance: "interaction-only",
          "response-field-name": "captchaToken",
          callback: () => setProblem(null),
          "error-callback": () => setProblem("check"),
          "before-interactive-callback": () => setAsking(true),
        });
      },
      () => {
        if (!cancelled) setProblem("load");
      },
    );
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (widget.current) window.turnstile?.reset(widget.current);
  }, [resetSignal]);

  return (
    // Until Cloudflare needs a click there's nothing to see, so it takes no space.
    <div className={asking || problem ? "mb-5" : undefined}>
      <div ref={box} />
      {problem ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
          {problem === "load"
            ? "The browser check couldn't load. Allow challenges.cloudflare.com in any blocker, then reload this page."
            : `The browser check didn't pass. Reload this page to try again, or write to ${CONTACT.support}.`}
        </p>
      ) : null}
    </div>
  );
}
