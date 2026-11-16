import { ArrowUpIcon, ChatCircleTextIcon, FilePdfIcon, MagnifyingGlassIcon, MicrophoneIcon, PaperclipIcon, PencilSimpleIcon, PushPinIcon } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";

/**
 * Farbaek AI's chat as it looks, drawn from tokens with a sample conversation (stage 201): used in the homepage's tour and on
 * /chat, where nothing loads and nothing pretends to be live.
 */

function Rise({ className = "", children }: { i: number; className?: string; children: ReactNode }) {
  return <div className={className}>{children}</div>;
}

const CHATS = [
  { title: "Launch plan for the bakery", pinned: true },
  { title: "Summarise the tenancy agreement", active: true },
  { title: "Explain this SQL query" },
  { title: "Ideas for the menu page" },
];

/** Chat: the sidebar, a question with a file, and the answer as it arrives. */
export function ChatGlimpse() {
  return (
    <div className="grid h-full lg:grid-cols-[15rem_minmax(0,1fr)]">
      <Rise i={0} className="hidden flex-col gap-3 border-r border-line bg-canvas-2 p-4 lg:flex">
        <span className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-sm font-medium text-ink shadow-e1">
          <PencilSimpleIcon size={16} weight="bold" aria-hidden />
          New chat
        </span>
        <span className="flex h-10 items-center gap-2 rounded-sm border border-line bg-surface px-3 text-sm text-ink-3">
          <MagnifyingGlassIcon size={16} weight="bold" aria-hidden />
          Search chats
        </span>
        <ul className="grid gap-0.5 text-sm">
          {CHATS.map((c) => (
            <li key={c.title} className={`flex items-center gap-2 truncate rounded-full px-3 py-2 ${c.active ? "bg-surface font-medium text-ink shadow-e1" : "text-ink-2"}`}>
              {c.pinned ? <PushPinIcon size={14} weight="bold" aria-hidden className="shrink-0 text-ink-3" /> : null}
              <span className="truncate">{c.title}</span>
            </li>
          ))}
        </ul>
      </Rise>
      <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
        <Rise i={1} className="ml-auto grid max-w-[30rem] justify-items-end gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-2">
            <FilePdfIcon size={16} weight="bold" aria-hidden className="text-ink-3" />
            Tenancy agreement, PDF
          </span>
          <div className="rounded-[1.25rem] rounded-br-md bg-canvas-2 px-4 py-2.5 text-sm leading-relaxed text-ink">
            Summarise this tenancy agreement in a few points, and flag anything unusual.
          </div>
        </Rise>
        <Rise i={2} className="flex max-w-[34rem] gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <ChatCircleTextIcon size={16} weight="bold" aria-hidden />
          </span>
          <div className="min-w-0 text-sm leading-relaxed text-ink">
            <p>Here is the agreement in brief:</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-ink-2">
              <li>Three years from 1 March, with one renewal.</li>
              <li>Rent is reviewed once a year.</li>
              <li className="glimpse-caret">Unusual: you pay for repairs to the roof</li>
            </ol>
            <p className="mt-2 text-xs text-ink-3">Farbaek AI. Thought for 3 seconds.</p>
          </div>
        </Rise>
        <Rise i={3} className="mt-auto">
          <div className="flex items-center gap-2 rounded-[1.5rem] border border-line bg-surface p-2 pl-4 shadow-e1">
            <span className="min-w-0 flex-1 truncate text-sm text-ink-3">Ask Farbaek AI</span>
            <span className="hidden h-8 items-center rounded-full bg-canvas-2 px-3 text-xs text-ink-2 sm:inline-flex">Auto</span>
            <span className="flex size-8 items-center justify-center rounded-full text-ink-2">
              <PaperclipIcon size={16} weight="bold" aria-hidden />
            </span>
            <span className="flex size-8 items-center justify-center rounded-full text-ink-2">
              <MicrophoneIcon size={16} weight="bold" aria-hidden />
            </span>
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-on-primary">
              <ArrowUpIcon size={16} weight="bold" aria-hidden />
            </span>
          </div>
        </Rise>
      </div>
    </div>
  );
}

