"use client";

/**
 * Farbaek Chat's message box (stage 199): it grows with the words, takes files (the button, a paste or a drop) with each upload's
 * progress, listens when the person talks (the browser's own recogniser), switches to making an image with a choice of shape, and
 * carries the model and answer-style picker. Enter sends with a keyboard; on a phone the send button does. While an answer
 * streams, the send button stops it.
 */
import {
  ArrowUpIcon,
  CaretDownIcon,
  CheckCircleIcon,
  FilePdfIcon,
  FileTextIcon,
  GlobeIcon,
  ImageSquareIcon,
  MicrophoneIcon,
  PaperclipIcon,
  StopIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Fragment, useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { fileSizeLabel } from "@/core/chat/files";
import type { ChatModelOption } from "@/core/chat/models";
import { ASPECTS, CHAT_LIMITS, EFFORT_ABOUT, EFFORT_LABELS, EFFORTS, type Aspect, type ChatFile } from "@/core/chat/protocol";
import { useSpeech } from "@/components/survey/assistant/use-speech";
import { Menu, useMenuClose } from "./primitives";
import { setChatPrefs, useChatPrefs, useTouchFirst } from "./prefs";

export interface ComposerHandle {
  fill(text: string, options?: { mode?: "text" | "image"; files?: ChatFile[] }): void;
  attach(files: File[]): void;
  focus(): void;
}

export interface SendInput {
  text: string;
  files: ChatFile[];
  mode: "text" | "image";
  aspect: Aspect;
  model: string;
  effort: (typeof EFFORTS)[number];
}

interface Pending {
  key: string;
  name: string;
  size: number;
  kind: ChatFile["kind"];
  progress: number;
  status: "uploading" | "ready" | "failed";
  file?: ChatFile;
  error?: string;
  preview?: string;
  xhr?: XMLHttpRequest;
}

const ASPECT_LABELS: Record<Aspect, string> = { "1:1": "Square", "3:2": "Landscape", "2:3": "Portrait", "16:9": "Wide", "9:16": "Tall", "4:3": "Classic", "3:4": "Classic portrait" };

function kindOf(file: File): ChatFile["kind"] {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  return "text";
}

/** Large photos are made smaller before they leave the device: up to 2048 pixels on the long side, which the AI reads as well. */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    if (file.size < 1_500_000 && Math.max(bitmap.width, bitmap.height) <= 2048) {
      bitmap.close();
      return file;
    }
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    if (blob && blob.type === "image/webp" && blob.size < file.size) return blob;
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    return jpeg && jpeg.size < file.size ? jpeg : file;
  } catch {
    return file;
  }
}

function ModelPicker({ models, compact }: { models: ChatModelOption[]; compact: boolean }) {
  const prefs = useChatPrefs();
  const current = models.find((m) => m.id === prefs.model && m.unavailable === null) ?? models[0]!;
  return (
    <Menu
      label="Model and answer style"
      trigger={({ ref, open, toggle, id }) => (
        <button
          ref={ref}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={toggle}
          className="tap inline-flex min-h-10 max-w-[11rem] items-center gap-1 rounded-full px-3 text-sm text-ink-2 hover:bg-surface-raised hover:text-ink pointer-coarse:min-h-11"
          title="Model and answer style"
        >
          <span className="truncate font-medium text-ink">{current.name}</span>
          {compact ? null : <span className="hidden truncate text-ink-3 sm:inline">{EFFORT_LABELS[prefs.effort]}</span>}
          <CaretDownIcon size={14} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
        </button>
      )}
    >
      <ModelList models={models} current={current} effort={prefs.effort} />
    </Menu>
  );
}

function ModelList({ models, current, effort }: { models: ChatModelOption[]; current: ChatModelOption; effort: (typeof EFFORTS)[number] }) {
  const close = useMenuClose();
  return (
    <div className="grid gap-1">
      <p className="px-3 pb-1 pt-1.5 text-xs font-medium text-ink-3">Who answers</p>
      {models.map((m, i) => (
        <Fragment key={m.id}>
        {i === 1 ? <p className="mt-1 border-t border-line px-3 pb-1 pt-2.5 text-xs font-medium text-ink-3">Or choose a model yourself</p> : null}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={current.id === m.id}
          aria-disabled={m.unavailable !== null || undefined}
          onClick={() => {
            if (m.unavailable) return;
            setChatPrefs({ model: m.id });
            close();
          }}
          className="flex w-full items-start gap-3 rounded-sm px-3 py-2 text-left outline-none hover:bg-surface-raised focus-visible:bg-surface-raised aria-disabled:cursor-not-allowed aria-disabled:opacity-55"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">{m.name}</span>
            <span className="block text-xs leading-snug text-ink-3">{m.unavailable ?? m.about}</span>
          </span>
          {current.id === m.id ? <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-accent" aria-hidden /> : null}
        </button>
        </Fragment>
      ))}
      <p className="mt-1 border-t border-line px-3 pb-1 pt-2.5 text-xs font-medium text-ink-3">Answer style</p>
      <div role="radiogroup" aria-label="Answer style" className="mx-2 mb-1 grid grid-cols-3 rounded-full bg-canvas-2 p-0.5 ring-1 ring-line">
        {EFFORTS.map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={effort === e}
            onClick={() => setChatPrefs({ effort: e })}
            className="tap min-h-8 rounded-full px-2 text-xs text-ink-2 aria-checked:bg-surface aria-checked:font-medium aria-checked:text-ink aria-checked:shadow-e1"
          >
            {EFFORT_LABELS[e]}
          </button>
        ))}
      </div>
      <p className="px-3 pb-1.5 text-xs leading-snug text-ink-3">{EFFORT_ABOUT[effort]}</p>
      <WebSwitch />
    </div>
  );
}

/** Live web search (stage 205; stage 206: when a question needs it): on unless the person switches it off, remembered in this browser. */
function WebSwitch() {
  const { searchWeb } = useChatPrefs();
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={searchWeb}
      onClick={() => setChatPrefs({ searchWeb: !searchWeb })}
      className="mt-1 flex w-full items-start gap-3 rounded-sm border-t border-line px-3 pb-2 pt-2.5 text-left outline-none hover:bg-surface-raised focus-visible:bg-surface-raised"
    >
      <GlobeIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-ink-2" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">Search the web</span>
        <span className="block text-xs leading-snug text-ink-3">{searchWeb ? "Checks the live web when a question needs it, and shows its sources." : "Off: answers come from what the model already knows."}</span>
      </span>
      <span aria-hidden className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 ${searchWeb ? "bg-accent" : "bg-line-2"}`}>
        <span className={`size-4 rounded-full bg-surface shadow-e1 transition-transform duration-150 ${searchWeb ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}

export function Composer({
  ref,
  disabledReason,
  imagesOff,
  imagePercent,
  usagePercent,
  models,
  busy,
  onSend,
  onStop,
  placement,
}: {
  ref?: Ref<ComposerHandle>;
  disabledReason: string | null;
  imagesOff: string | null;
  imagePercent: number | null;
  usagePercent: number | null;
  models: ChatModelOption[];
  busy: boolean;
  onSend: (input: SendInput) => boolean;
  onStop: () => void;
  placement: "center" | "bottom";
}) {
  const prefs = useChatPrefs();
  const touch = useTouchFirst();
  const speech = useSpeech();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [mode, setMode] = useState<"text" | "image">("text");
  const [aspect, setAspect] = useState<Aspect>("1:1");
  const [note, setNote] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const [spokenBase, setSpokenBase] = useState("");

  // The composer's height, for the thread's bottom space and the toasts above it.
  useEffect(() => {
    const el = shell.current;
    const root = el?.closest<HTMLElement>(".chat-root");
    if (!el || !root) return;
    const ro = new ResizeObserver(() => root.style.setProperty("--chat-composer", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Local previews are freed when their file is removed or sent, and when the composer goes.
  const previews = useRef(new Set<string>());
  const freePreview = (url?: string) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    previews.current.delete(url);
  };
  useEffect(() => {
    const all = previews.current;
    return () => all.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const upload = useCallback(async (file: File) => {
    const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`;
    const kind = kindOf(file);
    const preview = kind === "image" ? URL.createObjectURL(file) : undefined;
    if (preview) previews.current.add(preview);
    setFiles((list) => [...list, { key, name: file.name, size: file.size, kind, progress: 0, status: "uploading", preview }]);
    const body = await shrink(file);
    const xhr = new XMLHttpRequest();
    setFiles((list) => list.map((f) => (f.key === key ? { ...f, xhr } : f)));
    xhr.open("POST", "/app/chat/api/upload");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("content-type", body.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setFiles((list) => list.map((f) => (f.key === key ? { ...f, progress: e.loaded / e.total } : f)));
    };
    xhr.onload = () => {
      let reply: { ok?: boolean; file?: ChatFile; message?: string } = {};
      try {
        reply = JSON.parse(xhr.responseText);
      } catch {
        reply = {};
      }
      setFiles((list) =>
        list.map((f) =>
          f.key !== key ? f : reply.ok && reply.file ? { ...f, status: "ready", progress: 1, file: reply.file, size: reply.file.size } : { ...f, status: "failed", error: reply.message ?? "That file couldn't be attached. Try again." },
        ),
      );
    };
    xhr.onerror = () => setFiles((list) => list.map((f) => (f.key === key ? { ...f, status: "failed", error: "The connection dropped while attaching. Try again." } : f)));
    xhr.send(body);
  }, []);

  const attach = useCallback(
    (list: File[]) => {
      if (disabledReason) return;
      const room = CHAT_LIMITS.files - files.length;
      if (list.length > room) setNote(`A message carries up to ${CHAT_LIMITS.files} files. The first ${Math.max(0, room)} were added.`);
      for (const f of list.slice(0, Math.max(0, room))) {
        if (f.size > CHAT_LIMITS.fileBytes && !f.type.startsWith("image/")) {
          setNote(`${f.name} is larger than 5 MB. Attach a smaller file.`);
          continue;
        }
        void upload(f);
      }
    },
    [disabledReason, files.length, upload],
  );

  useImperativeHandle(
    ref,
    () => ({
      fill(value, options) {
        setText(value);
        if (options?.mode) setMode(options.mode);
        if (options?.files) setFiles(options.files.map((f) => ({ key: f.id, name: f.name, size: f.size, kind: f.kind, progress: 1, status: "ready", file: f })));
        window.setTimeout(() => {
          area.current?.focus();
          area.current?.setSelectionRange(value.length, value.length);
        }, 0);
      },
      attach,
      focus: () => area.current?.focus(),
    }),
    [attach],
  );

  const uploading = files.some((f) => f.status === "uploading");
  const ready = files.filter((f) => f.status === "ready" && f.file).map((f) => f.file!);
  const canSend = !disabledReason && !busy && !uploading && (text.trim().length > 0 || (mode === "text" && ready.length > 0));

  const send = () => {
    if (!canSend) return;
    if (speech.listening) speech.stop();
    const accepted = onSend({ text: text.trim(), files: ready, mode, aspect, model: prefs.model, effort: prefs.effort });
    if (accepted) {
      setText("");
      files.forEach((f) => freePreview(f.preview));
      setFiles([]);
      setNote(null);
    }
  };

  const listen = () => {
    if (speech.listening) {
      speech.stop();
      return;
    }
    const base = text ? `${text.trimEnd()} ` : "";
    setSpokenBase(base);
    speech.start({
      lang: navigator.language || "en-US",
      continuous: true,
      onWords: (words) => setHeard(words),
      onFinal: (words) => {
        setHeard(null);
        if (words) setText(`${base}${words}`);
        area.current?.focus();
      },
      onError: (code) => {
        setHeard(null);
        setNote(
          code === "not-allowed" || code === "service-not-allowed"
            ? "The microphone is blocked for Farbaek in this browser. Allow it in the site settings, or type instead."
            : code === "audio-capture"
              ? "No microphone was found. Plug one in, or type instead."
              : code === "network"
                ? "Listening needs a connection in this browser, and it was lost. Try again, or type instead."
                : "The browser stopped listening. Try again, or type instead.",
        );
      },
    });
  };

  const shown = heard !== null ? `${spokenBase}${heard}` : text;
  const placeholder = disabledReason ? "Sending is off" : mode === "image" ? "Describe the image you want" : "Ask Farbaek AI";

  return (
    <div ref={shell} className={placement === "bottom" ? "shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-4" : "w-full"}>
      <div className="mx-auto w-full max-w-3xl [view-transition-name:chat-composer]">
        {disabledReason ? (
          <p className="mb-2 flex items-start gap-2 rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm text-ink-2 shadow-e1">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
            {disabledReason}
          </p>
        ) : null}
        {/* Light under the box (stage 202): a soft pool of the spectrum that comes up while the box is in use or Farbaek AI
            is answering, and a thin edge of it round the box on focus. Gradients only, and they fade; nothing loops. */}
        <div className="chat-composer-glow relative">
        <span aria-hidden className="chat-composer-aura" />
        <span aria-hidden className="chat-composer-ring" />
        <div
          className={`relative rounded-lg border bg-surface shadow-e2 transition-[border-color,box-shadow] duration-200 ease-standard focus-within:shadow-e3 ${mode === "image" ? "border-accent/45" : "border-line focus-within:border-line-2"}`}
        >
          {files.length > 0 ? (
            <ul className="flex gap-2 overflow-x-auto px-3 pt-3 [scrollbar-width:none]" aria-label="Attached files">
              {files.map((f) => (
                <li key={f.key} className={`relative flex w-52 shrink-0 items-center gap-2.5 rounded-md border p-2 pr-10 ${f.status === "failed" ? "border-failed/50" : "border-line"} bg-canvas`}>
                  {f.kind === "image" && (f.preview || f.file) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a local preview or the person's own file
                    <img src={f.preview ?? `/app/chat/api/file/${f.file!.id}`} alt="" className="size-10 shrink-0 rounded-sm bg-surface-sunken object-cover" />
                  ) : (
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm bg-surface-raised text-ink-2">
                      {f.kind === "pdf" ? <FilePdfIcon size={20} weight="bold" aria-hidden /> : <FileTextIcon size={20} weight="bold" aria-hidden />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink">{f.name}</span>
                    <span className={`block truncate text-xs ${f.status === "failed" ? "text-failed" : "text-ink-3"}`} title={f.error}>
                      {f.status === "failed" ? f.error : f.status === "uploading" ? `Attaching, ${Math.round(f.progress * 100)}%` : `${f.kind === "pdf" ? "PDF" : f.kind === "image" ? "Picture" : "Text"}, ${fileSizeLabel(f.size)}`}
                    </span>
                    {f.status === "uploading" ? (
                      <span className="mt-1 block h-0.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
                        <span className="block h-full origin-left rounded-full bg-accent transition-transform duration-150" style={{ transform: `scaleX(${Math.max(0.04, f.progress)})` }} />
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => {
                      f.xhr?.abort();
                      freePreview(f.preview);
                      setFiles((list) => list.filter((x) => x.key !== f.key));
                    }}
                    className="tap absolute right-0 top-0 inline-flex size-10 items-center justify-center rounded-full text-ink-3 hover:bg-surface-raised hover:text-ink"
                  >
                    <XIcon size={14} weight="bold" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <label htmlFor="chat-composer" className="sr-only">
            {mode === "image" ? "Describe the image" : "Message"}
          </label>
          <textarea
            id="chat-composer"
            ref={area}
            value={shown}
            disabled={disabledReason !== null}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const pasted = [...e.clipboardData.files];
              if (pasted.length > 0) {
                e.preventDefault();
                attach(pasted);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && busy) {
                e.preventDefault();
                onStop();
                return;
              }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && prefs.enterSends && !touch) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={mode === "image" ? CHAT_LIMITS.imagePrompt : CHAT_LIMITS.message}
            placeholder={placeholder}
            enterKeyHint={touch ? "enter" : "send"}
            aria-describedby="chat-composer-hint"
            className="block max-h-[min(40dvh,18rem)] min-h-14 w-full resize-none bg-transparent px-4 pb-1 pt-4 text-base leading-relaxed text-ink outline-none placeholder:text-ink-3 disabled:cursor-not-allowed [field-sizing:content] lg:pointer-fine:text-body"
          />

          <div className="flex items-center gap-1 px-2 pb-2 pt-1">
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*,.md,.csv,.json,.ts,.tsx,.js,.py,.sql,.yaml,.yml"
              onChange={(e) => {
                attach([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => picker.current?.click()}
              disabled={disabledReason !== null}
              aria-label="Attach files"
              title="Attach pictures, PDFs or text files"
              className="tap inline-flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-raised hover:text-ink disabled:opacity-45 pointer-coarse:size-11"
            >
              <PaperclipIcon size={20} weight="bold" aria-hidden />
            </button>
            <button
              type="button"
              aria-pressed={mode === "image"}
              disabled={disabledReason !== null}
              onClick={() => {
                if (imagesOff && mode === "text") {
                  setNote(imagesOff);
                  return;
                }
                setMode(mode === "image" ? "text" : "image");
                area.current?.focus();
              }}
              className={`tap inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-3 text-sm transition-colors duration-150 disabled:opacity-45 pointer-coarse:min-h-11 max-[27rem]:min-w-11 max-[27rem]:px-0 ${
                mode === "image" ? "bg-accent/10 font-medium text-accent" : imagesOff ? "text-ink-3 hover:bg-surface-raised" : "text-ink-2 hover:bg-surface-raised hover:text-ink"
              }`}
            >
              <ImageSquareIcon size={16} weight="bold" aria-hidden />
              <span className="whitespace-nowrap max-[27rem]:sr-only">Create an image</span>
            </button>
            {mode === "image" ? (
              <Menu
                label="Image shape"
                align="start"
                items={ASPECTS.map((a) => ({ label: `${ASPECT_LABELS[a]}, ${a}`, checked: aspect === a, onSelect: () => setAspect(a) }))}
                trigger={({ ref: r, open, toggle, id }) => (
                  <button ref={r} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={toggle} className="tap inline-flex min-h-10 items-center gap-1 rounded-full px-2.5 text-sm text-ink-2 hover:bg-surface-raised hover:text-ink pointer-coarse:min-h-11">
                    <span className="tabular">{aspect}</span>
                    <CaretDownIcon size={14} weight="bold" className="text-ink-3" aria-hidden />
                  </button>
                )}
              />
            ) : null}
            {speech.supported ? (
              <button
                type="button"
                onClick={listen}
                disabled={disabledReason !== null}
                aria-pressed={speech.listening}
                aria-label={speech.listening ? "Stop listening" : "Speak your message"}
                title={speech.listening ? "Stop listening" : "Speak your message"}
                className={`tap relative inline-flex size-10 items-center justify-center rounded-full disabled:opacity-45 pointer-coarse:size-11 ${speech.listening ? "bg-failed/10 text-failed" : "text-ink-2 hover:bg-surface-raised hover:text-ink"}`}
              >
                {speech.listening ? <span className="absolute inset-0 rounded-full ring-2 ring-failed/40 motion-safe:animate-ping" aria-hidden /> : null}
                <MicrophoneIcon size={20} weight="bold" aria-hidden />
              </button>
            ) : null}
            <div className="ml-auto flex items-center gap-1">
              {mode === "text" ? <ModelPicker models={models} compact={false} /> : null}
              {busy ? (
                <button type="button" onClick={onStop} aria-label="Stop the answer" title="Stop (Esc)" className="tap inline-flex size-10 pointer-coarse:size-11 items-center justify-center rounded-full bg-primary text-on-primary transition-transform duration-150 hover:bg-primary-hover active:scale-95">
                  <StopIcon size={16} weight="fill" aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={send}
                  disabled={!canSend}
                  aria-label={mode === "image" ? "Create the image" : "Send"}
                  title={uploading ? "Wait for the files to attach" : mode === "image" ? "Create the image" : "Send"}
                  className="tap inline-flex size-10 items-center justify-center rounded-full bg-primary text-on-primary pointer-coarse:size-11 transition-[transform,background-color,opacity] duration-150 hover:bg-primary-hover active:scale-95 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-3 disabled:active:scale-100"
                >
                  <ArrowUpIcon size={16} weight="bold" aria-hidden />
                </button>
              )}
            </div>
          </div>
        </div>
        </div>
        <p id="chat-composer-hint" className="mt-1.5 min-h-4 px-2 text-center text-xs text-ink-3" aria-live="polite">
          {note ??
            (speech.listening
              ? "Listening. Press the microphone again when you've finished."
              : mode === "image"
                ? `Images use your AI usage${imagePercent !== null ? `: about ${imagePercent}% of a month's each` : ""}${usagePercent !== null ? `, and ${usagePercent}% is used so far` : ""}.`
                : "Farbaek AI can make mistakes. Check what matters.")}
        </p>
      </div>
    </div>
  );
}
