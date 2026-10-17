"use client";

import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { useActionState, useId } from "react";
import { buttonClasses } from "@/components/ui/button";
import { requestSignInLink, type SignInState } from "./actions";

export function SignInForm({ linkError, next = "/app" }: { linkError: boolean; next?: string }) {
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
      </div>
    );
  }

  const message = state.status === "error" ? state.message : linkError ? "That sign-in link has expired or was already used. Request a new one." : null;

  return (
    <form action={action} className="grid gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
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
      <button type="submit" disabled={pending} className={buttonClasses("primary", "md", "w-full")}>
        {pending ? "Sending link…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
