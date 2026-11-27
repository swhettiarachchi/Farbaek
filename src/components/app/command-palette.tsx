"use client";

import { ArrowsLeftRightIcon, BlocksIcon, ChatCircleTextIcon, LayoutIcon, MagnifyingGlassIcon, MicrophoneIcon, PlusIcon, ShieldCheckIcon, ShieldStarIcon, FolderSimpleIcon } from "@/components/icons";
import type { Icon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { switchWorkspace } from "@/app/app/actions";
import { PROMPT_STORAGE_KEY } from "@/components/build/prompt-composer";
import { HOME_QUESTION_KEY } from "@/core/chat/protocol";
import { useSpeech } from "@/components/survey/assistant/use-speech";
import { APP_PAGES } from "./app-nav";
import { BUILD_MIN, rankCommands } from "./command-match";

const OPEN_EVENT = "farbaek:open-palette";
const MAX_RESULTS = 12;
/** How long a silence after words ends the listening: one question, not a conversation. */
const LISTEN_PAUSE_MS = 1_600;

/** What choosing a command does, carried out by one handler. */
type Action = { kind: "go"; href: string } | { kind: "build"; prompt: string } | { kind: "ask"; question: string; research: boolean } | { kind: "switch"; orgId: string };

interface Command {
  id: string;
  group: "Ask" | "Build" | "Go to" | "Projects" | "Workspaces";
  label: string;
  hint?: string;
  icon: Icon;
  keywords?: string[];
  action: Action;
}

const noSubscribe = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

/** The keyboard shortcut, as this computer writes it. */
function useShortcutLabel(): string {
  return useSyncExternalStore(noSubscribe, () => (isMac() ? "⌘K" : "Ctrl K"), () => "Ctrl K");
}

/** Opens the palette from anywhere in the app, for buttons that offer it. */
export function PaletteTrigger() {
  const shortcut = useShortcutLabel();
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      title={`Ask or search (${shortcut})`}
      className="@container flex h-10 w-full items-center gap-2.5 rounded-full border border-line bg-surface px-3.5 text-label text-ink-3 pointer-coarse:h-11 shadow-e1 transition-colors duration-150 hover:text-ink"
    >
      <MagnifyingGlassIcon size={16} weight="bold" aria-hidden />
      <span className="flex-1 truncate whitespace-nowrap text-left">Ask or search</span>
      {/* The shortcut shows where the box has room for it: beside the microphone it is in the tooltip instead. */}
      <kbd className="hidden rounded-full border border-line px-1.5 font-mono text-xs text-ink-3 @[13.5rem]:inline">{shortcut}</kbd>
    </button>
  );
}

/** The palette's button on a phone's header: touch screens have no Ctrl+K (ADR 0211). */
export function PaletteIconButton() {
  return (
    <button
      type="button"
      data-open-palette
      aria-label="Ask or search"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="tap inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-surface hover:text-ink"
    >
      <MagnifyingGlassIcon size={20} weight="bold" aria-hidden />
    </button>
  );
}

/**
 * Ask by voice from any page of the app's frame (stage 289, ADR 0297): beside the sidebar's search box, it opens the
 * palette already listening. Only where the browser has a recogniser, so a microphone is never shown that can't hear.
 * On a phone the palette's own microphone does the same, one press in.
 */
export function AskButton() {
  const { supported } = useSpeech();
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { listen: true } }))}
      aria-label="Ask Farbaek AI by voice"
      title="Ask Farbaek AI by voice"
      className="tap inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-e1 transition-colors duration-150 hover:text-ink pointer-coarse:size-11"
    >
      <MicrophoneIcon size={20} weight="bold" aria-hidden />
    </button>
  );
}

/**
 * The command palette (Phase C): Ctrl or Cmd+K anywhere in the app. Go to a
 * page or project, start a build from what you type, or switch workspace.
 * It only navigates or calls the same actions the pages use, so every rule
 * still applies on the server.
 */
export function CommandPalette({
  projects,
  workspaces,
  canBuild,
  admin,
}: {
  projects: { id: string; name: string }[];
  workspaces: { id: string; name: string; current: boolean }[];
  canBuild: boolean;
  admin: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [, startTransition] = useTransition();
  const listId = useId();

  // The native modal dialog keeps focus inside and closes on Escape. It opens in the key handler itself,
  // so letters typed straight after the shortcut land in the search box.
  const close = () => dialog.current?.close();

  // Dictation, by the browser's own recogniser: the words land in the box, and the person still chooses what to do with them.
  const speech = useSpeech();
  const [note, setNote] = useState<string | null>(null);
  /** What dictation last put in the box. Once the box holds anything else, the person has taken over. */
  const spoken = useRef<string | null>(null);
  const pause = useRef<number | null>(null);
  const quiet = () => {
    if (pause.current !== null) window.clearTimeout(pause.current);
    pause.current = null;
  };
  useEffect(() => quiet, []);
  /** Starts listening after `startText`, the words already in the box (none when the palette has just been opened to listen). */
  const startListening = (startText: string) => {
    quiet();
    setNote(null);
    const base = startText ? `${startText.trimEnd()} ` : "";
    spoken.current = startText;
    const put = (words: string): boolean => {
      // Typed over since the last words: the box is the person's now, and listening ends without touching it.
      if ((input.current?.value ?? "") !== spoken.current) {
        quiet();
        speech.abort();
        return false;
      }
      const next = `${base}${words}`;
      spoken.current = next;
      setQuery(next);
      setActive(0);
      return true;
    };
    speech.start({
      lang: navigator.language || "en-US",
      continuous: false,
      onWords: (words) => {
        if (!put(words)) return;
        // One question, not a conversation: a short silence after words ends the listening.
        quiet();
        pause.current = window.setTimeout(() => speech.stop(), LISTEN_PAUSE_MS);
      },
      onFinal: (words) => {
        quiet();
        if (words) put(words);
        input.current?.focus();
      },
      onError: (code) => {
        quiet();
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
  const toggleListening = () => {
    if (speech.listening) {
      quiet();
      speech.stop();
    } else startListening(input.current?.value ?? "");
  };
  // The newest way to start, for the opener below, which is set up once.
  const listenNow = useRef(startListening);
  useEffect(() => {
    listenNow.current = startListening;
  });

  useEffect(() => {
    const show = (e?: Event) => {
      setQuery("");
      setActive(0);
      setNote(null);
      const d = dialog.current;
      if (d && !d.open) {
        d.showModal();
        input.current?.focus();
        // Opened by the Ask button: it starts listening where the browser can, inside the same press.
        if (e instanceof CustomEvent && (e.detail as { listen?: unknown } | null)?.listen === true) listenNow.current("");
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, []);

  const commands = useMemo(() => {
    const all: Command[] = [];
    const typed = query.trim();
    all.push({ id: "new", group: "Build", label: "New build", icon: PlusIcon, keywords: ["create", "start", "prompt"], action: { kind: "go", href: "/app/build" } });
    for (const page of APP_PAGES) all.push({ id: page.href, group: "Go to", label: page.label, icon: page.icon, keywords: [page.short, ...(page.also ?? [])], action: { kind: "go", href: page.href } });
    all.push({ id: "/app/templates", group: "Go to", label: "Templates", icon: LayoutIcon, keywords: ["gallery", "starter", "site"], action: { kind: "go", href: "/app/templates" } });
    all.push({ id: "/app/rescue", group: "Go to", label: "Check an app built elsewhere", icon: ShieldCheckIcon, keywords: ["import", "zip", "security", "rescue"], action: { kind: "go", href: "/app/rescue" } });
    if (admin) all.push({ id: "/admin", group: "Go to", label: "Admin console", icon: ShieldStarIcon, action: { kind: "go", href: "/admin" } });
    for (const p of projects) all.push({ id: `p:${p.id}`, group: "Projects", label: p.name, hint: "Project", icon: FolderSimpleIcon, action: { kind: "go", href: `/app/projects/${p.id}` } });
    for (const w of workspaces) {
      if (!w.current) all.push({ id: `w:${w.id}`, group: "Workspaces", label: `Switch to ${w.name}`, icon: ArrowsLeftRightIcon, keywords: ["workspace"], action: { kind: "switch", orgId: w.id } });
    }
    // What the typed words themselves can do: ask Farbaek AI, research it, plan it as a build. Which of everything leads
    // is one tested rule (rankCommands): a page that was named, else the question, and a build only when the words read as one.
    const own: Record<string, Command> = {
      ask: { id: "ask", group: "Ask", label: `Ask Farbaek AI: ${typed}`, hint: "Opens in Chat, ready to send", icon: ChatCircleTextIcon, action: { kind: "ask", question: typed, research: false } },
      research: { id: "research", group: "Ask", label: `Research: ${typed}`, hint: "Opens in Chat, set to check the web", icon: MagnifyingGlassIcon, action: { kind: "ask", question: typed, research: true } },
      build: { id: "build", group: "Build", label: `Plan a build: ${typed}`, hint: "You approve the plan first", icon: BlocksIcon, action: { kind: "build", prompt: typed } },
    };
    const pages = new Map(all.map((c) => [c.id, c]));
    return rankCommands(typed, all, canBuild, MAX_RESULTS)
      .map((id) => own[id] ?? pages.get(id))
      .filter((c): c is Command => c !== undefined);
  }, [query, canBuild, admin, projects, workspaces]);

  const run = (action: Action) => {
    close();
    if (action.kind === "go") router.push(action.href);
    else if (action.kind === "build") {
      // Kept in this browser only, never in a URL; Build's start sends it once.
      try {
        window.localStorage.setItem(PROMPT_STORAGE_KEY, action.prompt);
      } catch {
        // Without storage Build's start opens empty and the text is typed again.
      }
      router.push("/app/build?resume=1");
    } else if (action.kind === "ask") {
      // Kept in this browser only, never in a URL; Chat puts it in its box, and the person sends it.
      try {
        window.localStorage.setItem(HOME_QUESTION_KEY, action.question.slice(0, 8_000));
      } catch {
        // Without storage Chat opens with an empty box and the question is typed again.
      }
      router.push(action.research ? "/app/chat?ask=1&research=1" : "/app/chat?ask=1");
    } else {
      const form = new FormData();
      form.set("orgId", action.orgId);
      startTransition(() => switchWorkspace(form));
    }
  };

  const current = Math.min(active, Math.max(0, commands.length - 1));
  const optionId = (i: number) => `${listId}-${i}`;

  return (
    <dialog
      ref={dialog}
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
      aria-label="Ask or search"
      onClose={() => {
        quiet();
        speech.abort();
      }}
      className="m-0 mx-auto mt-[12dvh] w-[min(640px,calc(100vw-2rem))] max-w-none overflow-hidden rounded-lg border border-line bg-surface p-0 text-ink shadow-e3 backdrop:bg-ink/25 backdrop:backdrop-blur-sm open:motion-safe:animate-[usage-in_160ms_cubic-bezier(0.16,1,0.3,1)_both]"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <MagnifyingGlassIcon size={20} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (commands.length) setActive((current + (e.key === "ArrowDown" ? 1 : commands.length - 1)) % commands.length);
            } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              const chosen = commands[current];
              if (chosen) run(chosen.action);
            }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={commands.length ? optionId(current) : undefined}
          aria-autocomplete="list"
          placeholder={canBuild ? "Ask, go to a page, or describe a build" : "Ask, or go to a page or project"}
          className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none sm:h-14 placeholder:text-ink-3"
        />
        {speech.supported ? (
          <button
            type="button"
            onClick={toggleListening}
            aria-pressed={speech.listening}
            aria-label={speech.listening ? "Stop listening" : "Speak instead of typing"}
            title={speech.listening ? "Stop listening" : "Speak instead of typing"}
            className={`tap relative inline-flex size-10 shrink-0 items-center justify-center rounded-full ${speech.listening ? "bg-failed/10 text-failed" : "text-ink-2 hover:bg-surface-raised hover:text-ink"}`}
          >
            {speech.listening ? <span className="absolute inset-0 rounded-full ring-2 ring-failed/40 motion-safe:animate-ping" aria-hidden /> : null}
            <MicrophoneIcon size={20} weight={speech.listening ? "fill" : "bold"} aria-hidden />
          </button>
        ) : null}
        <kbd className="hidden rounded-full border border-line px-1.5 font-mono text-xs text-ink-3 sm:inline">Esc</kbd>
      </div>
      {note ? (
        <p role="status" className="border-b border-line px-4 py-2.5 text-sm text-ink-2">
          {note}
        </p>
      ) : speech.listening ? (
        <p role="status" className="border-b border-line px-4 py-2.5 text-sm text-ink-2">
          Listening. Say what you want to ask, find or build.
        </p>
      ) : null}
      <ul id={listId} role="listbox" aria-label="Results" className="max-h-[min(60dvh,440px)] overflow-y-auto p-2">
        {commands.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-ink-3">
            Type a question to ask Farbaek AI, or the name of a page or project.{canBuild ? ` ${BUILD_MIN} characters or more can be planned as a build.` : ""}
          </li>
        ) : (
          commands.map((c, i) => {
            const showGroup = i === 0 || commands[i - 1]!.group !== c.group;
            return (
              <li key={c.id} role="presentation">
                {showGroup ? <p className="px-3 pb-1 pt-2 text-xs font-medium text-ink-3">{c.group}</p> : null}
                <div
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === current}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(c.action)}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-3 text-sm ${i === current ? "bg-surface-raised text-ink" : "text-ink-2"}`}
                >
                  <c.icon size={16} weight="bold" className={c.group === "Build" ? "shrink-0 text-accent" : "shrink-0"} aria-hidden />
                  {/* On a phone the words typed keep the row's width, and what choosing it does sits under them. */}
                  <span className="flex min-w-0 flex-1 flex-col py-1.5 sm:flex-row sm:items-center sm:gap-3 sm:py-0">
                    <span className="min-w-0 truncate sm:flex-1">{c.label}</span>
                    {c.hint ? <span className="truncate text-xs text-ink-3 sm:shrink-0">{c.hint}</span> : null}
                  </span>
                </div>
              </li>
            );
          })
        )}
      </ul>
      <p className="hidden border-t border-line px-4 py-2.5 text-xs text-ink-3 sm:block">Arrow keys to move, Enter to open. A question waits in Chat for you to send, and a build for your approval.</p>
    </dialog>
  );
}
