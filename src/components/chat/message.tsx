"use client";

/**
 * One message of a conversation (stage 199): the person's question, with its files, which can be edited into a new branch; or
 * Farbaek's answer, drawn from Markdown as it streams, with its actions (copy, read aloud, rate, ask again, continue, share).
 * A message with siblings shows which of them it is ("2 of 3") and switches between them.
 */
import {
  ArrowClockwiseIcon,
  ArrowsOutSimpleIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  CopyIcon,
  DesktopIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  FilePdfIcon,
  FileTextIcon,
  VideoCameraIcon,
  FlagIcon,
  GlobeIcon,
  BlocksIcon,
  ImageSquareIcon,
  PencilSimpleIcon,
  PlayIcon,
  ShareNetworkIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  WarningCircleIcon,
} from "@/components/icons";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { fileSizeLabel } from "@/core/chat/files";
import type { ChatFile, ChatMessage, HandOff } from "@/core/chat/protocol";
import { BrandLogo } from "@/components/brand/brand-logo";
import { BrandMark } from "@/components/brand/brand-mark";
import { buttonClasses } from "@/components/ui/button";
import { AnswerPartsContext, type AnswerParts } from "./answer-parts";
import { MarkdownView } from "./markdown-view";
import { StatusGlyph } from "@/components/ui/status-badge";
import { IconButton, Menu, useCopy } from "./primitives";
import { searchLine, WebSources, type LiveSearch } from "./web-sources";
import { withSourceList } from "@/core/web/sources";

export const fileUrl = (id: string, base = "/app/chat/api/file") => `${base}/${id}`;

/** What came of a message that asked for something to be remembered (stage 207). */
const MEMORY_LINE = {
  saved: "Saved to memory. You can see it and delete it under Memory in Chat settings.",
  full: "Not saved: 50 things are remembered already. Forget one under Memory in Chat settings.",
  failed: "Not saved to memory: it didn't work this time. Try again, or add it under Memory in Chat settings.",
} as const;

function seconds(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s} ${s === 1 ? "second" : "seconds"}` : `${Math.round(s / 60)} ${Math.round(s / 60) === 1 ? "minute" : "minutes"}`;
}

export function BranchSwitch({ message, onSwitch, disabled }: { message: ChatMessage; onSwitch: (id: string) => void; disabled: boolean }) {
  const at = message.siblings.indexOf(message.id);
  if (message.siblings.length < 2 || at < 0) return null;
  const prev = message.siblings[at - 1];
  const next = message.siblings[at + 1];
  return (
    <span className="inline-flex items-center text-xs text-ink-3" role="group" aria-label="Versions">
      <IconButton label="Previous version" icon={CaretLeftIcon} disabled={disabled || !prev} onClick={() => prev && onSwitch(prev)} className="pointer-coarse:size-11" />
      <span className="tabular min-w-12 text-center" aria-live="polite">
        {at + 1} of {message.siblings.length}
      </span>
      <IconButton label="Next version" icon={CaretRightIcon} disabled={disabled || !next} onClick={() => next && onSwitch(next)} className="pointer-coarse:size-11" />
    </span>
  );
}

function FileChip({ file, base }: { file: ChatFile; base: string }) {
  if (file.kind === "image") {
    return (
      <a href={fileUrl(file.id, base)} target="_blank" rel="noopener" className="block overflow-hidden rounded-md border border-line bg-surface-sunken" title={file.name}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the person's own private file */}
        <img src={fileUrl(file.id, base)} alt={file.name} width={file.width ?? undefined} height={file.height ?? undefined} loading="lazy" className="h-28 w-auto max-w-[14rem] object-cover sm:h-36" />
      </a>
    );
  }
  return (
    <a href={`${fileUrl(file.id, base)}?download`} className="flex w-56 max-w-full items-center gap-2.5 rounded-md border border-line bg-surface p-2 hover:border-line-2">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm bg-surface-raised text-ink-2">{file.kind === "pdf" ? <FilePdfIcon size={20} weight="bold" aria-hidden /> : <FileTextIcon size={20} weight="bold" aria-hidden />}</span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-ink">{file.name}</span>
        <span className="block text-xs text-ink-3">
          {file.kind === "pdf" ? "PDF" : "Text"}, {fileSizeLabel(file.size)}
        </span>
      </span>
    </a>
  );
}

export function UserMessage({
  message,
  readOnly = false,
  busy = false,
  fileBase = "/app/chat/api/file",
  onEdit,
  onSwitch,
}: {
  message: ChatMessage;
  readOnly?: boolean;
  busy?: boolean;
  fileBase?: string;
  onEdit?: (text: string) => void;
  onSwitch?: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [copied, copy] = useCopy();
  return (
    <article className="chat-message group flex flex-col items-end gap-2 motion-safe:animate-[chat-rise_240ms_cubic-bezier(0.16,1,0.3,1)_both]" aria-label="You said">
      {message.files.length > 0 ? (
        <div className="flex max-w-[min(85%,36rem)] flex-wrap justify-end gap-2">
          {message.files.map((f) => (
            <FileChip key={f.id} file={f} base={fileBase} />
          ))}
        </div>
      ) : null}
      {editing ? (
        <form
          className="w-full max-w-[min(100%,40rem)] rounded-lg border border-line-2 bg-surface p-3 shadow-e2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim() && message.files.length === 0) return;
            setEditing(false);
            onEdit?.(draft.trim());
          }}
        >
          <label htmlFor={`edit-${message.id}`} className="sr-only">
            Edit your message
          </label>
          <textarea
            id={`edit-${message.id}`}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
            className="block max-h-[40dvh] min-h-16 w-full resize-none bg-transparent px-1 text-base leading-relaxed text-ink outline-none [field-sizing:content] lg:pointer-fine:text-body"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-ink-3">Your earlier version is kept: switch back with the arrows.</p>
            <span className="flex gap-2">
              <button type="button" onClick={() => setEditing(false)} className={buttonClasses("ghost", "sm")}>
                Cancel
              </button>
              <button type="submit" disabled={busy || (!draft.trim() && message.files.length === 0)} className={buttonClasses("primary", "sm")}>
                Send
              </button>
            </span>
          </div>
        </form>
      ) : message.content ? (
        <div className="max-w-[min(85%,40rem)] whitespace-pre-wrap rounded-[1.25rem] rounded-br-md bg-surface-raised px-4 py-2.5 text-body leading-relaxed text-ink [overflow-wrap:anywhere]">{message.content}</div>
      ) : null}
      {!editing ? (
        <div className="flex items-center gap-0.5 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100 pointer-coarse:opacity-100">
          {onSwitch ? <BranchSwitch message={message} onSwitch={onSwitch} disabled={busy} /> : null}
          <IconButton
            label={copied ? "Copied" : "Copy"}
            icon={copied ? CheckIcon : CopyIcon}
            className="pointer-coarse:size-11"
            onClick={() => void copy(message.content)}
          />
          {!readOnly && onEdit ? (
            <IconButton
              label="Edit"
              icon={PencilSimpleIcon}
              className="pointer-coarse:size-11"
              disabled={busy}
              onClick={() => {
                setDraft(message.content);
                setEditing(true);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export interface AnswerActions {
  onRegenerate(): void;
  onContinue(): void;
  onRate(rating: -1 | 1 | null): void;
  onSpeak(): void;
  onShare(): void;
  onSwitch(id: string): void;
  onOpenImage(file: ChatFile): void;
  onEditImage(file: ChatFile): void;
  /** Open another space with this conversation's request in its box. */
  onHandOff?(to: HandOff): void;
  /** Send one of the answer's choices as the next message (stage 206). */
  onChoose?(text: string): void;
  /** Answer again, this time checking the live web (stage 206): for an answer that was written without it. */
  onCheckWeb?(): void;
}

/**
 * Where an answer can go next (stage 202): each opens that space with the request in its box. Nothing is made until the person
 * presses its button there. Shown only for a request that is about that kind of thing (stage 206, handoff.ts): an answer about
 * the news doesn't offer to build a website. The desktop entry opens the page for Farbaek's desktop app, and carries nothing.
 */
const HANDOFFS: { to: HandOff; label: string; short: string; hint: string; icon: typeof BlocksIcon; tone: string }[] = [
  { to: "images", label: "Make a picture", short: "Picture", hint: "Opens Images with your request in its box", icon: ImageSquareIcon, tone: "text-spark-rose" },
  { to: "video", label: "Make a video", short: "Video", hint: "Opens Video with your request in its box", icon: VideoCameraIcon, tone: "text-spark-aqua" },
  { to: "build", label: "Build a website", short: "Website", hint: "Opens Build with your request in its box", icon: BlocksIcon, tone: "text-spark-leaf" },
  { to: "desktop", label: "See the desktop app", short: "Desktop app", hint: "Opens the page for Farbaek's desktop app, which works on your own computer", icon: DesktopIcon, tone: "text-ink-3" },
];

export function AnswerMessage({
  message,
  thinking,
  search,
  speaking = false,
  busy = false,
  last = false,
  readOnly = false,
  fileBase = "/app/chat/api/file",
  handOffs,
  after,
  actions,
}: {
  message: ChatMessage;
  /** Drawn under the answer's chips, for the newest answer only: the offer to schedule what was asked (stage 273). */
  after?: ReactNode;
  /** The places this answer's request could go next (handoff.ts). Missing: none are offered. */
  handOffs?: readonly HandOff[];
  /** The thinking summary while the model thinks; null when it isn't thinking. */
  thinking?: string | null;
  /** Where the live web search is, while it runs (stage 205). */
  search?: LiveSearch | null;
  speaking?: boolean;
  busy?: boolean;
  last?: boolean;
  readOnly?: boolean;
  fileBase?: string;
  actions?: AnswerActions;
}) {
  const router = useRouter();
  const [copied, copy] = useCopy();
  const [showThinking, setShowThinking] = useState(false);
  const streaming = message.status === "streaming";
  const waiting = streaming && !message.content && message.kind === "text";
  // Only the end of the branch continues: an answer with questions after it doesn't change under them.
  const canContinue = last && message.kind === "text" && (message.status === "stopped" || message.meta.stop === "length") && message.content.trim().length > 0;
  // What the answer's own parts need (stage 206): its sources by number, for citations in the text, and a way to send a choice.
  const found = message.meta.search;
  const choose = last && !busy && !readOnly && !streaming ? actions?.onChoose : undefined;
  const parts = useMemo<AnswerParts>(() => ({ sources: found?.status === "done" && found.sources.length > 0 ? new Map(found.sources.map((s) => [s.n, s])) : null, onChoose: choose, stories: found?.roundup === true, pictures: !readOnly }), [found, choose, readOnly]);
  const offered = HANDOFFS.filter((h) => handOffs?.includes(h.to));
  // An answer written without checking the web can be asked again with it.
  const canCheckWeb = !readOnly && last && message.kind === "text" && message.status === "complete" && found?.status === "skipped" && Boolean(actions?.onCheckWeb);

  return (
    <article className="chat-message group sm:grid sm:grid-cols-[2rem_minmax(0,1fr)] sm:gap-x-3 motion-safe:animate-[chat-rise_240ms_cubic-bezier(0.16,1,0.3,1)_both]" aria-label="Farbaek AI said" aria-busy={streaming || undefined}>
      <BrandMark live={streaming} className="hidden sm:inline-flex" />
      <div className="min-w-0">
      {thinking !== undefined && thinking !== null && streaming ? (
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setShowThinking((v) => !v)}
            aria-expanded={showThinking}
            className="tap inline-flex min-h-10 items-center gap-2 rounded-full pr-2 text-sm text-ink-3 hover:text-ink-2"
          >
            <span className="relative inline-flex size-6 items-center justify-center sm:hidden" aria-hidden>
              <span className="absolute inset-0 rounded-full bg-accent/10 motion-safe:animate-pulse" />
              <BrandLogo height={20} />
            </span>
            Thinking
            {thinking ? <CaretDownIcon size={14} weight="bold" className={`transition-transform duration-150 ${showThinking ? "rotate-180" : ""}`} aria-hidden /> : null}
          </button>
          {showThinking && thinking ? <p className="mt-1 max-w-2xl whitespace-pre-wrap border-l-2 border-line pl-3 text-sm leading-relaxed text-ink-3">{thinking.slice(-1_200)}</p> : null}
        </div>
      ) : waiting ? (
        <div className="flex min-h-8 items-center gap-2 text-sm text-ink-3" role="status">
          <span className="relative inline-flex size-6 items-center justify-center sm:hidden" aria-hidden>
            <span className="absolute inset-0 rounded-full bg-accent/10 motion-safe:animate-pulse" />
            <BrandLogo height={20} />
          </span>
          {searchLine(search) ?? "Working on it"}
        </div>
      ) : null}

      {message.kind === "image" ? (
        <ImageAnswer message={message} fileBase={fileBase} readOnly={readOnly} onOpen={actions?.onOpenImage} onEdit={actions?.onEditImage} />
      ) : message.content ? (
        <AnswerPartsContext.Provider value={parts}>
          <MarkdownView text={message.content} streaming={streaming} />
        </AnswerPartsContext.Provider>
      ) : null}

      {message.status === "failed" && message.error ? (
        <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-ink-2">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          <span>
            {message.error}
            {!readOnly && actions ? (
              <>
                {" "}
                <button type="button" onClick={actions.onRegenerate} disabled={busy} className="font-medium text-accent underline-offset-4 hover:underline disabled:opacity-50">
                  Try again
                </button>
              </>
            ) : null}
          </span>
        </p>
      ) : null}
      {message.kind === "text" && message.meta.search ? <WebSources search={message.meta.search} /> : null}
      {message.meta.memory ? (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-ink-3">
          <StatusGlyph status={message.meta.memory === "saved" ? "done" : "attention"} size={16} className="mt-0.5 shrink-0" />
          {MEMORY_LINE[message.meta.memory]}
        </p>
      ) : null}
      {message.status === "stopped" && !streaming ? <p className="mt-2 text-sm text-ink-3">{message.content ? "Stopped. What was written is kept." : "Stopped before it started."}</p> : null}
      {message.meta.stop === "length" && message.status === "complete" ? <p className="mt-2 text-sm text-ink-3">The answer reached its length limit.</p> : null}

      {last && !streaming && actions?.onHandOff && offered.length > 0 && message.kind === "text" && message.status === "complete" && message.content ? (
        <div role="group" aria-label="Take this further" className="mt-4 flex flex-wrap gap-2">
          {offered.map((h, i) => (
            <button
              key={h.to}
              type="button"
              title={h.hint}
              aria-label={h.label}
              onClick={() => actions.onHandOff?.(h.to)}
              style={{ animationDelay: `${80 + i * 50}ms` }}
              className="tap inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm text-ink-2 shadow-e1 transition-[border-color,color,transform] duration-150 hover:-translate-y-px hover:border-line-strong/60 hover:text-ink active:scale-[0.98] pointer-coarse:min-h-11 motion-safe:animate-[chat-rise_240ms_cubic-bezier(0.16,1,0.3,1)_both]"
            >
              <h.icon size={14} weight="fill" className={h.tone} aria-hidden />
              {/* One row on a phone: the short word there, the whole phrase from a tablet up. */}
              <span className="sm:hidden">{h.short}</span>
              <span className="max-sm:hidden">{h.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {last && !streaming && message.kind === "text" && message.status === "complete" && message.content ? after : null}

      {!streaming ? (
        <div className={`mt-2 flex flex-wrap items-center gap-0.5 ${last ? "" : "sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100"} transition-opacity duration-150 pointer-coarse:opacity-100`}>
          {actions ? <BranchSwitch message={message} onSwitch={actions.onSwitch} disabled={busy} /> : null}
          {message.kind === "text" && message.content ? (
            <IconButton
              label={copied ? "Copied" : "Copy"}
              icon={copied ? CheckIcon : CopyIcon}
              className="pointer-coarse:size-11"
              // With the cited sources listed under it: the numbers in the text mean nothing without them.
              onClick={() => void copy(withSourceList(message.content, message.meta.search))}
            />
          ) : null}
          {!readOnly && actions ? (
            <>
              {message.kind === "text" && message.content ? <IconButton label={speaking ? "Stop reading" : "Read aloud"} icon={speaking ? SpeakerSlashIcon : SpeakerHighIcon} pressed={speaking} className="pointer-coarse:size-11" onClick={actions.onSpeak} /> : null}
              {message.status === "complete" ? (
                <>
                  <IconButton label="Good answer" icon={ThumbsUpIcon} pressed={message.rating === 1} className="pointer-coarse:size-11" onClick={() => actions.onRate(message.rating === 1 ? null : 1)} />
                  <IconButton label="Not a good answer" icon={ThumbsDownIcon} pressed={message.rating === -1} className="pointer-coarse:size-11" onClick={() => actions.onRate(message.rating === -1 ? null : -1)} />
                </>
              ) : null}
              <IconButton label={message.kind === "image" ? "Make another version" : "Answer again"} icon={ArrowClockwiseIcon} className="pointer-coarse:size-11" disabled={busy} onClick={actions.onRegenerate} />
              {canContinue ? (
                <button type="button" onClick={actions.onContinue} disabled={busy} className="tap ml-1 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium text-ink-2 hover:border-line-2 hover:text-ink disabled:opacity-50">
                  <PlayIcon size={14} weight="bold" aria-hidden /> Continue
                </button>
              ) : null}
              {canCheckWeb ? (
                <button type="button" onClick={actions.onCheckWeb} disabled={busy} title="Answers again after searching the live web" className="tap ml-1 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium text-ink-2 hover:border-line-2 hover:text-ink disabled:opacity-50">
                  <GlobeIcon size={14} weight="bold" aria-hidden /> Check the web
                </button>
              ) : null}
              <Menu
                label="More for this answer"
                items={[
                  { label: "Share this chat", icon: ShareNetworkIcon, onSelect: actions.onShare },
                  { label: "Report this answer", icon: FlagIcon, onSelect: () => router.push("/app/help/new?topic=abuse"), hint: "Something wrong or harmful? Tell Farbaek." },
                ]}
                trigger={({ ref, open, toggle, id }) => (
                  <button ref={ref} type="button" aria-label="More for this answer" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={toggle} className="tap inline-flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-raised hover:text-ink pointer-coarse:size-11">
                    <DotsThreeIcon size={16} weight="bold" aria-hidden />
                  </button>
                )}
              />
            </>
          ) : null}
          {message.modelName || message.thinkingMs ? <AnswerDetails message={message} /> : null}
        </div>
      ) : null}
      </div>
    </article>
  );
}

/**
 * Who answered (ADR 0215): every answer is Farbaek AI's, and the model behind it is one press away, with why it was chosen.
 * Honest without making the provider the headline.
 */
function AnswerDetails({ message }: { message: ChatMessage }) {
  const [open, setOpen] = useState(false);
  const thought = message.thinkingMs && message.thinkingMs >= 1_000 ? ` Thought for ${seconds(message.thinkingMs)}.` : "";
  return (
    <span className="ml-2 inline-flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-ink-3">
      <span>
        Farbaek AI.{thought}
      </span>
      {message.modelName ? (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="inline-flex min-h-10 items-center rounded-full px-1.5 font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline pointer-coarse:min-h-11"
          >
            {open ? "Hide details" : "Details"}
          </button>
          {open ? (
            <span className="basis-full text-ink-2 [overflow-wrap:anywhere]">
              Answered by {message.modelName}
              {message.meta.why ? `, chosen for ${message.meta.why}` : ""}.
              {checkedAt(message)}
              {message.meta.project ? ` Told about your project ${message.meta.project}: its files and tasks by name, not what is inside them.` : ""}
            </span>
          ) : null}
        </>
      ) : null}
    </span>
  );
}

/** When the web was checked for this answer, in the person's own time; shown only once Details is opened (stage 205). */
function checkedAt(message: ChatMessage): string {
  const search = message.meta.search;
  if (search?.status === "skipped") return ` Answered without checking the web: ${search.reason ?? "this message didn't need current information"}.`;
  if (!search || search.status !== "done") return "";
  const t = Date.parse(search.at);
  if (!Number.isFinite(t)) return "";
  const when = new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const rounds = (search.rounds ?? 1) > 1 ? " in two rounds" : "";
  return ` Checked the web on ${when}${rounds}${search.queries.length > 0 ? `, searching for ${search.queries.map((q) => `“${q}”`).join(", ")}` : ""}.`;
}

function ImageAnswer({ message, fileBase, readOnly, onOpen, onEdit }: { message: ChatMessage; fileBase: string; readOnly: boolean; onOpen?: (f: ChatFile) => void; onEdit?: (f: ChatFile) => void }) {
  const file = message.files.find((f) => f.generated) ?? message.files[0];
  const [w, h] = (message.meta.aspect ?? "1:1").split(":").map(Number) as [number, number];
  if (message.status === "streaming") {
    return (
      <div className="w-full max-w-md" role="status" aria-label="Drawing the image">
        <div className="relative overflow-hidden rounded-md border border-line bg-surface-raised" style={{ aspectRatio: `${w || 1} / ${h || 1}` }}>
          <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_45%,color-mix(in_oklab,var(--color-accent)_14%,transparent),transparent)] motion-safe:animate-pulse" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-ink-3">
            <BrandLogo height={36} />
            Drawing your image
          </div>
        </div>
        {message.meta.prompt ? <p className="mt-2 line-clamp-2 text-xs text-ink-3">{message.meta.prompt}</p> : null}
      </div>
    );
  }
  if (!file) return null;
  const src = fileUrl(file.id, fileBase);
  return (
    <figure className="w-full max-w-md">
      <button type="button" onClick={() => onOpen?.(file)} className="group/img relative block w-full overflow-hidden rounded-md border border-line bg-surface-sunken" aria-label="Open the image full size">
        {/* eslint-disable-next-line @next/next/no-img-element -- a private image from Farbaek's own route */}
        <img src={src} alt={message.meta.prompt ?? "Image made by Farbaek"} width={file.width ?? undefined} height={file.height ?? undefined} className="block h-auto w-full motion-safe:animate-[chat-fade_320ms_ease-out_both]" />
        <span className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-surface/85 text-ink opacity-0 shadow-e1 backdrop-blur-sm transition-opacity duration-150 group-hover/img:opacity-100 group-focus-visible/img:opacity-100" aria-hidden>
          <ArrowsOutSimpleIcon size={16} weight="bold" />
        </span>
      </button>
      <figcaption className="mt-2 flex flex-wrap items-center gap-1">
        <a href={`${src}?download`} download={file.name} className="tap inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium text-ink-2 hover:border-line-2 hover:text-ink">
          <DownloadSimpleIcon size={14} weight="bold" aria-hidden /> Download
        </a>
        {!readOnly && onEdit ? (
          <button type="button" onClick={() => onEdit(file)} className="tap inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium text-ink-2 hover:border-line-2 hover:text-ink">
            <PencilSimpleIcon size={14} weight="bold" aria-hidden /> Change it
          </button>
        ) : null}
        <span className="ml-1 text-xs text-ink-3">Made with AI.</span>
      </figcaption>
    </figure>
  );
}
