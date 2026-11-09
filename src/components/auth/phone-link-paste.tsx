"use client";

import { ArrowRightIcon, ClipboardTextIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";

/**
 * Signing in the Farbaek app (ADR 0110) happens in a browser sheet that
 * shares Safari's cookies. A sign-in email opened in another browser signs
 * that browser in instead, so the sheet would wait for nothing. Pasting the
 * link here finishes it in the sheet, where the sign-in started. Only
 * Farbaek's own sign-in links are followed.
 */
export function PhoneLinkPaste({ next, siteOrigin, authOrigin }: { next: string; siteOrigin: string; authOrigin: string | null }) {
  const inputId = useId();
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);

  function follow(form: FormData) {
    const raw = String(form.get("link") ?? "").trim();
    let url: URL | null = null;
    try {
      url = new URL(raw);
    } catch {
      url = null;
    }
    const ours = url !== null && url.protocol === "https:" && ((url.origin === siteOrigin && url.pathname === "/auth/callback") || (authOrigin !== null && url.origin === authOrigin && url.pathname === "/auth/v1/verify"));
    if (!url || !ours) {
      setError("That isn't a Farbaek sign-in link. Copy the whole link from the email and try again.");
      return;
    }
    setError(null);
    window.location.assign(url.toString());
  }

  return (
    <div className="mt-6 grid gap-4 border-t border-line pt-6">
      <a href={next} className={buttonClasses("primary", "md", "w-full justify-center")}>
        I opened the link in Safari, continue
        <ArrowRightIcon size={16} weight="bold" aria-hidden />
      </a>
      <form action={follow} className="grid gap-2" noValidate>
        <label htmlFor={inputId} className={LABEL_CLASSES}>
          Opened it in another browser? Paste the link here
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            name="link"
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={inputClasses("min-w-0 flex-1")}
          />
          <button type="submit" className={buttonClasses("secondary", "md")}>
            <ClipboardTextIcon size={16} aria-hidden />
            Use link
          </button>
        </div>
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-failed">
            {error}
          </p>
        ) : (
          <p className="text-sm text-ink-3">Press and hold the button in the email, choose Copy Link, then paste it here.</p>
        )}
      </form>
    </div>
  );
}
