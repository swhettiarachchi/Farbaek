"use client";

import { AppleLogoIcon, EnvelopeSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useActionState, useId } from "react";
import { PhoneLinkPaste } from "@/components/auth/phone-link-paste";
import { TurnstileCheck } from "@/components/auth/turnstile-check";
import { buttonClasses } from "@/components/ui/button";
import type { SignInState } from "@/server/auth/sign-in";
import { requestSignInLink } from "./actions";

/**
 * `phone`: set while the Farbaek app signs in (ADR 0110), so a link opened in another browser can still finish here.
 * `apple`: Sign in with Apple is offered (ADR 0114); a plain link starts it.
 */
export function SignInForm({
  notice = null,
  apple = false,
  next = "/app",
  captchaSiteKey = null,
  phone = null,
}: {
  notice?: string | null;
  apple?: boolean;
  next?: string;
  captchaSiteKey?: string | null;
  phone?: { siteOrigin: string; authOrigin: string | null } | null;
}) {
  const [state, action, pending] = useActionState<SignInState, FormData>(requestSignInLink, { status: "idle" });
  const emailId = useId();
  const errorId = useId();

  if (state.status === "sent") {
    return (
      <div role="status" className="rounded-md border border-line bg-surface p-6">
        <EnvelopeSimpleIcon size={28} className="text-accent" aria-hidden />
        <h2 className="mt-4 text-xl font-medium">Check your inbox</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          If <span className="font-medium text-ink">{state.email}</span> can receive mail, a sign-in link is on its way. The link works
          once and confirms your email address.
        </p>
        {phone ? <PhoneLinkPaste next={next} siteOrigin={phone.siteOrigin} authOrigin={phone.authOrigin} /> : null}
      </div>
    );
  }

  // The email's own problem sits under the field; why the last sign-in didn't finish sits above the form.
  const message = state.status === "error" ? state.message : null;
  const formNotice = state.status === "error" ? null : notice;

  return (
    <form action={action} className="grid gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      {formNotice ? (
        <p role="alert" className="flex gap-2 rounded-sm border border-failed/30 bg-failed/5 px-3 py-2.5 text-sm text-failed">
          <WarningCircleIcon size={18} weight="bold" className="mt-px shrink-0" aria-hidden />
          {formNotice}
        </p>
      ) : null}
      {apple ? (
        <>
          <a href={`/auth/apple?${new URLSearchParams({ next })}`} className={buttonClasses("outline", "md", "w-full")}>
            <AppleLogoIcon size={19} weight="fill" aria-hidden />
            Continue with Apple
          </a>
          <div className="flex items-center gap-3 text-[13px] text-ink-3" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            or with email
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      ) : null}
      <div className="grid gap-2">
        <label htmlFor={emailId} className="text-sm font-medium">
          Email address
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          defaultValue={state.status === "error" ? state.email : undefined}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? errorId : undefined}
          className="h-11 rounded-sm border border-line-strong bg-canvas px-3 text-base"
        />
        {message ? (
          <p id={errorId} role="alert" className="text-sm text-failed">
            {message}
          </p>
        ) : null}
      </div>
      <div>
        {captchaSiteKey ? <TurnstileCheck siteKey={captchaSiteKey} resetSignal={state} /> : null}
        <button type="submit" disabled={pending} className={buttonClasses("primary", "md", "w-full")}>
          {pending ? "Sending link…" : "Email me a sign-in link"}
        </button>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-3">
        By continuing, you accept the{" "}
        <Link href="/terms" className="text-ink-2 underline underline-offset-2 hover:text-ink">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/acceptable-use" className="text-ink-2 underline underline-offset-2 hover:text-ink">
          Acceptable Use Policy
        </Link>
        . The{" "}
        <Link href="/privacy" className="text-ink-2 underline underline-offset-2 hover:text-ink">
          Privacy Policy
        </Link>{" "}
        explains how we use your data.
      </p>
    </form>
  );
}
