"use client";

/**
 * How the drafting assistant listens and replies (stage 195): spoken replies, checking the words before they're sent, live talk's
 * pause, and hearing English on this computer. The choices stay on this device.
 *
 * Hearing English on the computer is Chrome's own (139 and later, on a computer): once the surveyor downloads it with a click, the
 * sound never leaves the computer, and Chrome listens for survey words such as bearing and perch. Where the browser doesn't offer it,
 * the choice isn't shown.
 */
import { useEffect, useId, useState, useSyncExternalStore, type KeyboardEvent, type RefObject } from "react";
import { LANGUAGES, ON_DEVICE_ENGLISH, type AssistLanguage, type BrowserFamily } from "@/core/survey/assistant/languages";
import { buttonClasses } from "@/components/ui/button";
import type { AssistantSettings } from "./assistant-context";
import { installOnDevice, onDeviceStatus, type OnDeviceStatus } from "./use-speech";

const noSubscribe = () => () => {};

const PAUSES = [
  [800, "0.8 s"],
  [1200, "1.2 s"],
  [2000, "2 s"],
] as const;

export function SettingsPanel({
  settings,
  setSettings,
  lang,
  family,
  speakUnavailable,
  languageNote,
  panelRef,
  onClose,
}: {
  settings: AssistantSettings;
  setSettings(change: Partial<AssistantSettings>): void;
  lang: AssistLanguage;
  family: BrowserFamily;
  /** Why replies can't be spoken here, or null. */
  speakUnavailable: string | null;
  /** How this browser hears a language: on the device, by which company, or not at all. */
  languageNote(id: AssistLanguage): string;
  panelRef: RefObject<HTMLDivElement | null>;
  onClose(refocus: boolean): void;
}) {
  const offered = lang === "en" && (family === "chrome" || family === "edge");
  const [device, setDevice] = useState<OnDeviceStatus | { state: "checking" }>(() => (offered ? { state: "checking" } : { state: "unavailable" }));
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  // Survey-word hints exist only in newer browsers (Chrome 142 and later); the help text promises them only where they do.
  const hints = useSyncExternalStore(noSubscribe, () => typeof (window as unknown as { SpeechRecognitionPhrase?: unknown }).SpeechRecognitionPhrase === "function", () => false);

  useEffect(() => {
    if (!offered) return;
    let live = true;
    void onDeviceStatus(ON_DEVICE_ENGLISH).then((s) => live && setDevice(s));
    return () => {
      live = false;
    };
  }, [offered]);

  const download = async (tag: string) => {
    setDownloading(true);
    setDownloadFailed(false);
    // The click is the user activation the browser needs for the download.
    const ok = await installOnDevice(tag);
    // Switched on only once the browser says English is really there; it may still be downloading.
    const now = ok ? await onDeviceStatus([tag]) : null;
    setDownloading(false);
    if (now?.state === "available") {
      setDevice(now);
      setSettings({ onDeviceTag: tag });
    } else if (now) setDevice(now);
    else setDownloadFailed(true);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
    }
  };

  const onDevice = settings.onDeviceTag !== null;
  const busy = downloading || device.state === "downloading";
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Assistant settings"
      onKeyDown={onKey}
      className="pointer-events-auto w-full max-w-3xl rounded-md bg-surface p-4 shadow-e2 ring-1 ring-line lg:ml-auto lg:max-w-[26rem] motion-safe:animate-[usage-in_220ms_cubic-bezier(0.16,1,0.3,1)_both]"
    >
      <h3 className="text-sm font-medium text-ink">How the assistant listens and replies</h3>
      <div className="mt-2 divide-y divide-line">
        <SwitchRow
          label="Spoken replies"
          help={speakUnavailable ?? "Short replies in this device's own voice, never while the microphone is open."}
          on={settings.speak && !speakUnavailable}
          disabled={Boolean(speakUnavailable)}
          onChange={(on) => setSettings({ speak: on })}
        />
        <SwitchRow
          label="Check my words before sending"
          help="What you say waits in the line for you to check, change and send. Numbers that could be read two ways are always held."
          on={settings.review}
          onChange={(on) => setSettings({ review: on })}
        />
        <LanguageRow value={lang} note={languageNote} onChange={(id) => setSettings({ lang: id })} />
        <PauseRow value={settings.pauseMs} onChange={(ms) => setSettings({ pauseMs: ms })} />
        {offered && (device.state === "available" || onDevice) ? (
          <SwitchRow
            label="Hear English on this computer"
            help={`The browser turns your speech into text here, without sending the sound off the computer${hints ? ", and listens for survey words such as bearing and perch" : ""}.`}
            on={onDevice}
            onChange={(on) => setSettings({ onDeviceTag: on ? (device.state === "available" ? device.tag : settings.onDeviceTag) : null })}
          />
        ) : null}
        {/* The download stays here while English isn't on the computer, even with the switch on (after Chrome removed it, say). */}
        {offered && (device.state === "downloadable" || device.state === "downloading") ? (
          <div className="grid gap-2 py-3">
            {onDevice ? (
              <p className="text-xs text-ink-2">English isn&apos;t on this computer any more, so listening won&apos;t work until it&apos;s downloaded again, or you switch this off.</p>
            ) : (
              <>
                <p className="text-sm font-medium text-ink">Hear English on this computer</p>
                <p className="text-xs text-ink-3">
                  The browser can turn your speech into text here, so the sound never leaves the computer{hints ? ", and listen for survey words such as bearing and perch" : ""}. It needs a one-time download by the browser.
                </p>
              </>
            )}
            {/* The button stays while it downloads, so the focus stays on it. */}
            <button
              type="button"
              aria-disabled={busy || undefined}
              onClick={() => !busy && void download(device.tag)}
              className={buttonClasses("secondary", "sm", "w-fit aria-disabled:cursor-not-allowed aria-disabled:opacity-70")}
            >
              {busy ? "Downloading English…" : "Download English for this computer"}
            </button>
            {busy ? (
              <p role="status" className="text-xs text-ink-2">
                The browser is downloading English for this computer. It can take a few minutes; close this and open it again to see when it&apos;s ready.
              </p>
            ) : null}
            {downloadFailed ? (
              <p role="status" className="text-xs text-ink-2">
                It didn&apos;t download. Try again later; meanwhile the assistant hears you through the browser&apos;s own service.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={() => onClose(true)} className={buttonClasses("ghost", "sm")}>
          Done
        </button>
      </div>
    </div>
  );
}

function SwitchRow({ label, help, on, onChange, disabled = false }: { label: string; help: string; on: boolean; onChange(on: boolean): void; disabled?: boolean }) {
  const helpId = useId();
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p id={helpId} className="mt-0.5 text-xs text-ink-3">
          {help}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        aria-describedby={helpId}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && onChange(!on)}
        className="inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-disabled:cursor-not-allowed"
      >
        <span aria-hidden className={`inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors duration-150 ${on ? "bg-accent" : disabled ? "bg-canvas-2 ring-1 ring-line" : "bg-line-strong"}`}>
          <span className={`size-5 rounded-full bg-surface shadow-e1 transition-transform duration-150 ${on ? "translate-x-5" : ""}`} />
        </span>
      </button>
    </div>
  );
}

/** The language heard and answered in, with how this browser hears the chosen one. Tamil waits for its own review. */
function LanguageRow({ value, note, onChange }: { value: AssistLanguage; note(id: AssistLanguage): string; onChange(id: AssistLanguage): void }) {
  const labelId = useId();
  const offered = LANGUAGES.filter((l) => l.enabled);
  const at = Math.max(0, offered.findIndex((l) => l.id === value));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    onChange(offered[(at + step + offered.length) % offered.length]!.id);
    const group = e.currentTarget;
    window.setTimeout(() => group.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus(), 0);
  };
  return (
    <div className="grid gap-2 py-3">
      <p id={labelId} className="text-sm font-medium text-ink">
        Language
      </p>
      <div role="radiogroup" aria-labelledby={labelId} onKeyDown={onKey} className="inline-flex w-fit rounded-full bg-canvas-2 p-0.5 ring-1 ring-line">
        {offered.map((l, i) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={i === at}
            tabIndex={i === at ? 0 : -1}
            onClick={() => onChange(l.id)}
            className={`min-h-11 rounded-full px-4 text-xs font-medium transition-colors duration-150 ${i === at ? "bg-surface text-ink shadow-e1" : "text-ink-2 hover:text-ink"}`}
          >
            {l.native}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-3">{note(value)} in this browser.</p>
    </div>
  );
}

function PauseRow({ value, onChange }: { value: number; onChange(ms: number): void }) {
  const labelId = useId();
  const at = Math.max(0, PAUSES.findIndex(([ms]) => ms === value));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (at + step + PAUSES.length) % PAUSES.length;
    onChange(PAUSES[next]![0]);
    const group = e.currentTarget;
    window.setTimeout(() => group.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus(), 0);
  };
  return (
    <div className="grid gap-2 py-3">
      <p id={labelId} className="text-sm font-medium text-ink">
        Live talk sends after a pause of
      </p>
      <div role="radiogroup" aria-labelledby={labelId} onKeyDown={onKey} className="inline-flex w-fit rounded-full bg-canvas-2 p-0.5 ring-1 ring-line">
        {PAUSES.map(([ms, label], i) => (
          <button
            key={ms}
            type="button"
            role="radio"
            aria-checked={i === at}
            tabIndex={i === at ? 0 : -1}
            onClick={() => onChange(ms)}
            className={`min-h-11 rounded-full px-4 text-xs font-medium tabular-nums transition-colors duration-150 ${i === at ? "bg-surface text-ink shadow-e1" : "text-ink-2 hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-3">A longer pause suits reading figures from a field book.</p>
    </div>
  );
}
