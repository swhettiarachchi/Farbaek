"use client";

import { CheckCircleIcon, CopyIcon, LinkBreakIcon, LinkIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { createTaskLinkAction, revokeTaskLinkAction, type LinkMade } from "@/app/app/scheduled/actions";
import { LINK_PAYLOAD_MAX, oncePer } from "@/core/automation/links";
import type { TaskLink } from "@/server/automation/links";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Disclosure } from "@/components/ui/disclosure";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";

const noSubscribe = () => () => undefined;

/** One line to copy: its name, its text in mono (it is copied, not read), and a button that says when it has been copied. */
function Copyable({ label, text, note }: { label: string; text: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      // The browser refused: the text is on screen to select by hand.
      setCopied(false);
    }
  };
  return (
    <div className="grid gap-1.5">
      <span className="text-sm text-ink-2">{label}</span>
      <div className="flex flex-wrap items-start gap-2">
        <code className="min-w-0 flex-1 basis-56 select-all break-all rounded-sm border border-line bg-surface-sunken px-3 py-2.5 font-mono text-sm text-ink">{text}</code>
        <button type="button" onClick={copy} className={buttonClasses("secondary", "sm")}>
          {copied ? <CheckCircleIcon size={16} weight="fill" aria-hidden /> : <CopyIcon size={16} weight="bold" aria-hidden />}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      {note ? <span className="text-sm text-ink-3">{note}</span> : null}
    </div>
  );
}

/**
 * A task's or an agent's link (stage 277, ADR 0284): the one way to start it besides its schedule. Another app calls the link with
 * a secret, and a run is queued as "Run now" would queue it. The secret is shown once, when the link is made; after that only when
 * it was made and used is known. `link` is null when the task has none; `unread` when its links couldn't be read, and then nothing
 * is offered that would stop a link nobody can see. `disabledReason` holds back making a link; `stopReason` holds back turning
 * one off, which is refused for far less: a person can always close a way in.
 */
export function RunLink({
  taskId,
  what,
  link,
  unread = false,
  waitSeconds,
  disabledReason,
  stopReason,
}: {
  taskId: string;
  what: "task" | "agent";
  link: TaskLink | null;
  unread?: boolean;
  /** The least time between two runs a link made now would start: the plan's. */
  waitSeconds: number;
  disabledReason: string | null;
  stopReason: string | null;
}) {
  const router = useRouter();
  const [fresh, setFresh] = useState<Extract<LinkMade, { status: "done" }> | null>(null);
  // The link just made stays on screen until the page shows, for certain, a different link for this task or none: turned off,
  // or replaced from somewhere else. Its secret then leads nowhere, and is taken away. A page that couldn't read the links
  // shows nothing for certain, so the secret stays: it is the only copy, and may not have been copied yet.
  const [seen, setSeen] = useState(false);
  if (fresh && !seen && link?.id === fresh.linkId) setSeen(true);
  const made = fresh && !(seen && !unread && link?.id !== fresh.linkId) ? fresh : null;
  // Making a new link stops the one in use, so that press asks first.
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The address is this site's own, known in the browser.
  const origin = useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => "",
  );
  const make = () =>
    startTransition(async () => {
      const r = await createTaskLinkAction(taskId).catch((): LinkMade => ({ status: "error", message: "The connection dropped. Reload the page to see whether a link was made." }));
      setAsking(false);
      if (r.status === "done") {
        setFresh(r);
        setSeen(false);
        setError(null);
        router.refresh();
      } else {
        setError(r.message);
      }
    });
  const off = disabledReason ?? (pending ? "Working on it." : null);
  const has = Boolean(link || made);
  const address = made ? `${origin}/api/v1/hooks/${made.linkId}` : "";
  // How often it may start a run: the link's own, kept when it was made, or the plan's for one made now.
  const wait = made?.waitSeconds ?? link?.waitSeconds ?? waitSeconds;
  const hint = made || link ? "It has a link." : unread ? "Its link couldn't be read just now." : "Off.";

  return (
    <Disclosure summary="Start it from another app" hint={hint}>
      <div className="grid gap-4 pt-4">
        <p className="text-sm leading-relaxed text-ink-2">
          Another app can start this {what} by calling a link with a secret only that app knows. It can send up to {LINK_PAYLOAD_MAX.toLocaleString("en-US")} characters for the run to work with. The run is told that they came from another app and to treat them as data, not as
          instructions. {has ? "This link" : "A link"} starts a run at most {oncePer(wait)}, and each run uses your plan&apos;s AI usage as any other does.
        </p>

        {made ? (
          <div className="grid gap-3 rounded-md border border-line p-3 sm:p-4">
            <p className="flex items-start gap-2 text-sm text-ink">
              <WarningCircleIcon size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-caution" />
              Copy the secret now. It is shown once, and Farbaek keeps no copy: if it is lost, make a new link.
            </p>
            <Copyable label="Address" text={address} />
            <Copyable label="Secret" text={made.secret} />
            <Copyable label="A call, as a command" text={`curl -X POST "${address}" -H "Authorization: Bearer ${made.secret}" -d "What happened, in a few words"`} note="In Windows PowerShell, write curl.exe in place of curl." />
          </div>
        ) : null}

        {unread ? <p className="text-sm text-ink-3">{made ? "The page couldn't read its links again just now. Reload it to turn this link off or make a new one." : "Reload the page to see its link. Nothing has been changed."}</p> : null}

        {unread ? null : (
          <>
            {link && !made ? (
              <p className="text-sm text-ink-2">
                Its link was made <LocalTime iso={link.createdAt} />.{" "}
                {link.lastUsedAt ? (
                  <>
                    It has started {link.uses === 1 ? "one run" : `${link.uses} runs`}, the last <RelativeTime iso={link.lastUsedAt} />.
                  </>
                ) : (
                  "It hasn't been used yet."
                )}{" "}
                The secret can&apos;t be shown again.
              </p>
            ) : null}
            {asking ? (
              <div className="grid gap-3 rounded-md border border-line p-3 sm:p-4">
                <p className="text-sm text-ink">Making a new link stops the one it has now. The app that calls it is refused until it is given the new secret.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={make} disabled={Boolean(off)} className={buttonClasses("primary", "sm")}>
                    <LinkIcon size={16} weight="bold" aria-hidden /> {pending ? "Making…" : "Make a new link"}
                  </button>
                  <button type="button" onClick={() => setAsking(false)} disabled={pending} className={buttonClasses("ghost", "sm")}>
                    Keep this one
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={has ? () => setAsking(true) : make} disabled={Boolean(off)} className={buttonClasses("secondary", "sm")}>
                  <LinkIcon size={16} weight="bold" aria-hidden /> {pending ? "Making…" : has ? "Make a new link" : "Make a link"}
                </button>
                {has ? (
                  <ConfirmAction
                    action={revokeTaskLinkAction}
                    fields={{ taskId }}
                    trigger={
                      <>
                        <LinkBreakIcon size={16} weight="bold" aria-hidden /> Turn the link off
                      </>
                    }
                    triggerVariant="ghost"
                    question="A call with its secret will be refused from now on. You can make a new link later."
                    confirmLabel="Turn it off"
                    pendingLabel="Turning off…"
                    disabledReason={stopReason}
                  />
                ) : null}
              </div>
            )}
            {off && !pending ? <p className="text-sm text-ink-3">{has ? `A new link can't be made. ${off}` : off}</p> : null}
          </>
        )}
        {error ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
    </Disclosure>
  );
}
