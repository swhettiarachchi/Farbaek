"use client";

import { ArrowsLeftRightIcon, FolderSimpleIcon, MagnifyingGlassIcon, ShieldStarIcon, SparkleIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { switchWorkspace } from "@/app/app/actions";
import { PROMPT_STORAGE_KEY } from "@/components/build/prompt-composer";
import { APP_PAGES } from "./app-nav";
import { matchScore } from "./command-match";

const OPEN_EVENT = "farbaek:open-palette";
/** A prompt needs a few words before it's worth planning, as in the prompt box. */
const BUILD_MIN = 8;
const MAX_RESULTS = 12;

/** What choosing a command does, carried out by one handler. */
type Action = { kind: "go"; href: string } | { kind: "build"; prompt: string } | { kind: "switch"; orgId: string };

interface Command {
  id: string;
  group: "Build" | "Go to" | "Projects" | "Workspaces";
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
      className="flex h-10 w-full items-center gap-2.5 rounded-full border border-line bg-surface px-3.5 text-[13.5px] text-ink-3 shadow-e1 transition-colors duration-150 hover:text-ink"
    >
      <MagnifyingGlassIcon size={16} aria-hidden />
      <span className="flex-1 truncate whitespace-nowrap text-left">Search or jump to</span>
      <kbd className="rounded-full border border-line px-1.5 font-mono text-[11px] text-ink-3">{shortcut}</kbd>
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

  useEffect(() => {
    const show = () => {
      setQuery("");
      setActive(0);
      const d = dialog.current;
      if (d && !d.open) {
        d.showModal();
        input.current?.focus();
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
    if (canBuild && typed.length >= BUILD_MIN) {
      all.push({ id: "build", group: "Build", label: `Plan a build: ${typed}`, hint: "You approve the plan first", icon: SparkleIcon, action: { kind: "build", prompt: typed } });
    }
    all.push({ id: "new", group: "Build", label: "New build", icon: SparkleIcon, keywords: ["create", "start", "prompt"], action: { kind: "go", href: "/app/new" } });
    for (const page of APP_PAGES) all.push({ id: page.href, group: "Go to", label: page.label, icon: page.icon, keywords: [page.short], action: { kind: "go", href: page.href } });
    if (admin) all.push({ id: "/admin", group: "Go to", label: "Admin console", icon: ShieldStarIcon, action: { kind: "go", href: "/admin" } });
    for (const p of projects) all.push({ id: `p:${p.id}`, group: "Projects", label: p.name, hint: "Project", icon: FolderSimpleIcon, action: { kind: "go", href: `/app/projects/${p.id}` } });
    for (const w of workspaces) {
      if (!w.current) all.push({ id: `w:${w.id}`, group: "Workspaces", label: `Switch to ${w.name}`, icon: ArrowsLeftRightIcon, keywords: ["workspace"], action: { kind: "switch", orgId: w.id } });
    }
    return all
      .map((c, i) => ({ c, i, score: c.id === "build" ? 5 : matchScore(typed, c.label, c.keywords) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, MAX_RESULTS)
      .map((x) => x.c);
  }, [query, canBuild, admin, projects, workspaces]);

  const run = (action: Action) => {
    close();
    if (action.kind === "go") router.push(action.href);
    else if (action.kind === "build") {
      // Kept in this browser only, never in a URL; the New build page sends it once.
      try {
        window.localStorage.setItem(PROMPT_STORAGE_KEY, action.prompt);
      } catch {
        // Without storage the New build page opens empty and the text is typed again.
      }
      router.push("/app/new?resume=1");
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
      aria-label="Search or jump to"
      className="m-0 mx-auto mt-[12dvh] w-[min(640px,calc(100vw-2rem))] max-w-none overflow-hidden rounded-lg border border-line bg-surface p-0 text-ink shadow-e3 backdrop:bg-ink/25 backdrop:backdrop-blur-sm open:motion-safe:animate-[usage-in_160ms_cubic-bezier(0.16,1,0.3,1)_both]"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <MagnifyingGlassIcon size={18} className="shrink-0 text-ink-3" aria-hidden />
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
            } else if (e.key === "Enter") {
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
          placeholder={canBuild ? "Go to a page or project, or describe a build" : "Go to a page or project"}
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-3"
        />
        <kbd className="hidden rounded-full border border-line px-1.5 font-mono text-[11px] text-ink-3 sm:inline">Esc</kbd>
      </div>
      <ul id={listId} role="listbox" aria-label="Results" className="max-h-[min(60dvh,440px)] overflow-y-auto p-2">
        {commands.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-ink-3">
            Nothing matches.{canBuild ? ` Type at least ${BUILD_MIN} characters to plan it as a build.` : ""}
          </li>
        ) : (
          commands.map((c, i) => {
            const showGroup = i === 0 || commands[i - 1]!.group !== c.group;
            return (
              <li key={c.id} role="presentation">
                {showGroup ? <p className="px-3 pb-1 pt-2 font-mono text-[11px] text-ink-3">{`// ${c.group.toLowerCase()}`}</p> : null}
                <div
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === current}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(c.action)}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-3 text-[14.5px] ${i === current ? "bg-surface-raised text-ink" : "text-ink-2"}`}
                >
                  <c.icon size={17} weight={i === current ? "bold" : "regular"} className={c.group === "Build" ? "shrink-0 text-accent" : "shrink-0"} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {c.hint ? <span className="shrink-0 text-xs text-ink-3">{c.hint}</span> : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
      <p className="hidden border-t border-line px-4 py-2.5 text-xs text-ink-3 sm:block">Arrow keys to move, Enter to open. Builds still wait for your approval.</p>
    </dialog>
  );
}
