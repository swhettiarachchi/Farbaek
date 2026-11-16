"use client";

/**
 * Farbaek Chat's dialogs (stage 199): sharing a conversation by link, renaming, deleting (which can't be undone, so it asks), the
 * settings, and a picture at full size.
 */
import { CheckIcon, CopyIcon, DesktopIcon, DownloadSimpleIcon, GlobeIcon, LinkBreakIcon, MoonIcon, SunIcon, UsersIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { LINK_LIFETIME_LABELS, LINK_LIFETIMES, type LinkLifetime } from "@/core/workspace/sharing";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";
import { shareChatAction, unshareChatAction } from "@/app/app/chat/actions";
import type { ChatAvailabilityView } from "./chat-shell";
import { setChatPrefs, useChatPrefs, type ChatTheme } from "./prefs";
import { Dialog } from "./primitives";

function Problem({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-failed">
      <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
      {text}
    </p>
  );
}

export function ShareDialog({ state, onClose, onShared }: { state: { id: string; title: string; shared: boolean } | null; onClose: () => void; onShared: (id: string, shared: boolean) => void }) {
  return state ? <ShareBody key={state.id} state={state} onClose={onClose} onShared={onShared} /> : <Dialog open={false} onClose={onClose} title="Share">{null}</Dialog>;
}

function ShareBody({ state, onClose, onShared }: { state: { id: string; title: string; shared: boolean }; onClose: () => void; onShared: (id: string, shared: boolean) => void }) {
  const [audience, setAudience] = useState<"workspace" | "anyone">("workspace");
  const [lifetime, setLifetime] = useState<LinkLifetime>("30");
  const [link, setLink] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(state.shared);
  const [pending, start] = useTransition();

  const create = () =>
    start(async () => {
      setProblem(null);
      const r = await shareChatAction(state.id, audience, lifetime);
      if (!r.ok) {
        setProblem(r.message);
        return;
      }
      setLink(r.value.link);
      setShared(true);
      onShared(state.id, true);
    });
  const stop = () =>
    start(async () => {
      const r = await unshareChatAction(state.id);
      if (!r.ok) {
        setProblem(r.message);
        return;
      }
      setLink(null);
      setShared(false);
      onShared(state.id, false);
    });
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setProblem("The link couldn't be copied. Select it and copy it yourself.");
    }
  };

  return (
    <Dialog open onClose={onClose} title={`Share “${state.title.slice(0, 60)}”`} description="People with the link see this conversation as it is now, read-only. Messages you add later aren't shared.">
      {link ? (
        <div>
          <label htmlFor="chat-share-link" className={LABEL_CLASSES}>
            Link
          </label>
          <div className="mt-1.5 flex gap-2">
            <input id="chat-share-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={inputClasses("min-w-0 flex-1 font-mono text-sm")} />
            <button type="button" onClick={copy} className={buttonClasses("primary", "sm", "shrink-0")}>
              {copied ? <CheckIcon size={16} weight="bold" aria-hidden /> : <CopyIcon size={16} weight="bold" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-3">This is the only time the link is shown: Farbaek keeps only a fingerprint of it. Make a new one any time; it replaces this one.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          <fieldset>
            <legend className={LABEL_CLASSES}>Who can open it</legend>
            <div className="mt-2 grid gap-2">
              {(
                [
                  ["workspace", UsersIcon, "People in this workspace", "They sign in to open it."],
                  ["anyone", GlobeIcon, "Anyone with the link", "No sign-in needed. Share it with care."],
                ] as const
              ).map(([value, Glyph, title, detail]) => (
                <label key={value} className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-3.5 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                  <input type="radio" name="chat-audience" value={value} checked={audience === value} onChange={() => setAudience(value)} className="mt-1 size-4 accent-[var(--accent)]" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Glyph size={16} weight="bold" className="text-ink-3" aria-hidden /> {title}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-3">{detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="chat-share-life" className={LABEL_CLASSES}>
              The link works for
            </label>
            <select id="chat-share-life" value={lifetime} onChange={(e) => setLifetime(e.target.value as LinkLifetime)} className={inputClasses("mt-1.5 w-full")}>
              {LINK_LIFETIMES.map((l) => (
                <option key={l} value={l}>
                  {LINK_LIFETIME_LABELS[l]}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={create} disabled={pending} className={buttonClasses("primary", "md", "w-full")}>
            {pending ? "Making the link…" : shared ? "Make a new link" : "Make a link"}
          </button>
        </div>
      )}
      <Problem text={problem} />
      {shared ? (
        <div className="mt-4 border-t border-line pt-4">
          <button type="button" onClick={stop} disabled={pending} className={buttonClasses("ghost", "sm", "-ml-3 text-failed hover:text-failed")}>
            <LinkBreakIcon size={16} weight="bold" aria-hidden /> Stop sharing
          </button>
          <p className="mt-1 text-xs text-ink-3">The link stops working at once.</p>
        </div>
      ) : null}
    </Dialog>
  );
}

export function RenameDialog({ state, onClose, onRename }: { state: { id: string; title: string } | null; onClose: () => void; onRename: (id: string, title: string) => Promise<string | null> }) {
  return state ? <RenameBody key={state.id} state={state} onClose={onClose} onRename={onRename} /> : <Dialog open={false} onClose={onClose} title="Rename">{null}</Dialog>;
}

function RenameBody({ state, onClose, onRename }: { state: { id: string; title: string }; onClose: () => void; onRename: (id: string, title: string) => Promise<string | null> }) {
  const [title, setTitle] = useState(state.title);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={onClose} title="Rename this chat">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setProblem(await onRename(state.id, title)));
        }}
      >
        <label htmlFor="chat-rename" className={LABEL_CLASSES}>
          Name
        </label>
        <input id="chat-rename" autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={inputClasses("mt-1.5 w-full")} aria-invalid={problem ? true : undefined} />
        <Problem text={problem} />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClasses("ghost", "sm")}>
            Cancel
          </button>
          <button type="submit" disabled={pending || !title.trim()} className={buttonClasses("primary", "sm")}>
            {pending ? "Saving…" : "Save name"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function ConfirmDialog({ state, onClose, onConfirm }: { state: { id: string; title: string } | null; onClose: () => void; onConfirm: (id: string) => Promise<string | null> }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog
      open={state !== null}
      onClose={() => {
        setProblem(null);
        onClose();
      }}
      title="Delete this chat?"
      description={state ? `“${state.title.slice(0, 80)}” and its messages, files and images are deleted for good, and any link to it stops working. This can't be undone. To keep it out of the way instead, archive it.` : undefined}
    >
      <Problem text={problem} />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonClasses("ghost", "sm")}>
          Keep it
        </button>
        <button type="button" disabled={pending} onClick={() => state && start(async () => setProblem(await onConfirm(state.id)))} className={buttonClasses("danger", "sm")}>
          {pending ? "Deleting…" : "Delete for good"}
        </button>
      </div>
    </Dialog>
  );
}

const THEMES: [ChatTheme, typeof SunIcon, string][] = [
  ["light", SunIcon, "Light"],
  ["dark", MoonIcon, "Dark"],
  ["system", DesktopIcon, "Auto"],
];

const SHORTCUTS: [string, string][] = [
  ["New chat", "Ctrl Shift O"],
  ["Search chats", "Ctrl Shift F"],
  ["Fold the sidebar", "Ctrl Shift S"],
  ["Go to the message box", "/"],
  ["Stop the answer", "Esc"],
  ["New line", "Shift Enter"],
];

export function SettingsDialog({ open, onClose, theme, onTheme, availability, planLabel }: { open: boolean; onClose: () => void; theme: ChatTheme; onTheme: (t: ChatTheme) => void; availability: ChatAvailabilityView; planLabel: string }) {
  const prefs = useChatPrefs();
  return (
    <Dialog open={open} onClose={onClose} title="Chat settings">
      <div className="grid gap-6">
        <section aria-labelledby="chat-set-look">
          <h3 id="chat-set-look" className={LABEL_CLASSES}>
            Appearance
          </h3>
          <div role="radiogroup" aria-labelledby="chat-set-look" className="mt-2 grid grid-cols-3 rounded-full bg-canvas-2 p-0.5 ring-1 ring-line sm:inline-grid">
            {THEMES.map(([value, Glyph, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                onClick={() => onTheme(value)}
                className="tap inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm text-ink-2 aria-checked:bg-surface aria-checked:font-medium aria-checked:text-ink aria-checked:shadow-e1"
              >
                <Glyph size={16} weight="bold" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">Auto follows this device. Dark is for Chat; the rest of Farbaek stays light.</p>
        </section>

        <section aria-labelledby="chat-set-send">
          <h3 id="chat-set-send" className={LABEL_CLASSES}>
            Sending
          </h3>
          <label className="mt-2 flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={prefs.enterSends} onChange={(e) => setChatPrefs({ enterSends: e.target.checked })} className="mt-1 size-4 accent-[var(--accent)]" />
            <span className="text-sm">
              Enter sends the message
              <span className="block text-xs text-ink-3">Shift and Enter start a new line. On a phone, Enter always adds a line and the send button sends.</span>
            </span>
          </label>
        </section>

        <section aria-labelledby="chat-set-usage">
          <h3 id="chat-set-usage" className={LABEL_CLASSES}>
            Plan and usage
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            {planLabel}.{" "}
            {availability.percent !== null ? (
              <>
                You&apos;ve used <span className="tabular font-medium text-ink">{availability.percent}%</span> of this {availability.period === "trial" ? "trial's" : "month's"} AI usage.
              </>
            ) : null}{" "}
            {availability.imagePercent !== null ? `Each image uses about ${availability.imagePercent}% of a month's usage.` : null}
          </p>
          <a href="/app/billing" className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-accent underline-offset-4 hover:underline">
            Plan and usage
          </a>
        </section>

        <section aria-labelledby="chat-set-keys" className="hidden lg:block">
          <h3 id="chat-set-keys" className={LABEL_CLASSES}>
            Keyboard
          </h3>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm">
            {SHORTCUTS.map(([what, keys]) => (
              <div key={what} className="contents">
                <dt className="text-ink-2">{what}</dt>
                <dd className="text-right font-mono text-xs text-ink-3">{keys}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="text-xs leading-relaxed text-ink-3">
          Your chats are private to you in this workspace. The models that answer are made by Anthropic and OpenAI; Farbaek sends them your messages only to answer you. Your account&apos;s data export includes every chat.
        </p>
      </div>
    </Dialog>
  );
}

export function ImageViewer({ image, onClose }: { image: { src: string; name: string; prompt: string | null; width: number | null; height: number | null } | null; onClose: () => void }) {
  return (
    <Dialog open={image !== null} onClose={onClose} title={image?.prompt ? image.prompt.slice(0, 90) : "Image"} wide>
      {image ? (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element -- a private file from Farbaek's own route */}
          <img src={image.src} alt={image.prompt ?? image.name} width={image.width ?? undefined} height={image.height ?? undefined} className="mx-auto max-h-[70dvh] w-auto rounded-md bg-surface-sunken object-contain" />
          <figcaption className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-ink-3">Made with AI by Farbaek.</span>
            <a href={`${image.src}?download`} download={image.name} className={buttonClasses("secondary", "sm")}>
              <DownloadSimpleIcon size={16} weight="bold" aria-hidden /> Download
            </a>
          </figcaption>
        </figure>
      ) : null}
    </Dialog>
  );
}
