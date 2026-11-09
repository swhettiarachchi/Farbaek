"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useActionState, useId } from "react";
import { TurnstileCheck } from "@/components/auth/turnstile-check";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";
import type { PasswordSignInState } from "@/server/auth/password-sign-in";
import { signInWithPasswordAction } from "../actions";

/** Signing in with a password (ADR 0151), for accounts Farbaek set up with one. */
export function PasswordSignInForm({ next = "/app", captchaSiteKey = null }: { next?: string; captchaSiteKey?: string | null }) {
  const [state, action, pending] = useActionState<PasswordSignInState, FormData>(signInWithPasswordAction, { status: "idle" });
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();
  const message = state.status === "error" ? state.message : null;

  return (
    <form action={action} className="grid gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-2">
        <label htmlFor={emailId} className={LABEL_CLASSES}>
          Email address
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          required
          defaultValue={state.status === "error" ? state.email : undefined}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? errorId : undefined}
          className={inputClasses()}
        />
      </div>
      <div className="grid gap-2">
        <label htmlFor={passwordId} className={LABEL_CLASSES}>
          Password
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? errorId : undefined}
          className={inputClasses()}
        />
        {message ? (
          <p id={errorId} role="alert" className="flex items-start gap-1.5 text-sm text-failed">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
            {message}
          </p>
        ) : null}
      </div>
      <div>
        {captchaSiteKey ? <TurnstileCheck siteKey={captchaSiteKey} resetSignal={state} /> : null}
        <button type="submit" disabled={pending} className={buttonClasses("primary", "md", "w-full")}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </div>
      <p className="text-label leading-relaxed text-ink-3">
        By continuing, you accept the{" "}
        <Link href="/terms" className="text-ink-2 underline underline-offset-2 hover:text-ink">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/acceptable-use" className="text-ink-2 underline underline-offset-2 hover:text-ink">
          Acceptable Use Policy
        </Link>
        .
      </p>
    </form>
  );
}
