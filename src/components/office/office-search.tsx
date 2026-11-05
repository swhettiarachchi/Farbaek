"use client";

import {
  BuildingsIcon,
  ChartLineUpIcon,
  ChatsCircleIcon,
  CpuIcon,
  CreditCardIcon,
  FingerprintIcon,
  GlobeIcon,
  HeartbeatIcon,
  IdentificationBadgeIcon,
  MagnifyingGlassIcon,
  MegaphoneIcon,
  PulseIcon,
  ScrollIcon,
  SlidersHorizontalIcon,
  UserIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { searchOfficeAction } from "@/app/office/actions";
import { matchScore } from "@/components/app/command-match";
import type { OfficeSearchHit } from "@/server/office/search";
import { OFFICE_PAGES, type OfficeHref } from "./office-pages";

const OPEN_EVENT = "farbaek:open-office-search";
const MIN_CHARS = 2;
const DEBOUNCE_MS = 180;

const PAGE_ICONS: Record<OfficeHref, Icon> = {
  "/": ChartLineUpIcon,
  "/workspaces": BuildingsIcon,
  "/people": UsersThreeIcon,
  "/support": ChatsCircleIcon,
  "/activity": PulseIcon,
  "/sites": GlobeIcon,
  "/health": HeartbeatIcon,
  "/controls": SlidersHorizontalIcon,
  "/models": CpuIcon,
  "/payments": CreditCardIcon,
  "/announcements": MegaphoneIcon,
  "/staff": IdentificationBadgeIcon,
  "/audit": ScrollIcon,
  "/security": FingerprintIcon,
};
const HIT_ICONS: Record<OfficeSearchHit["kind"], Icon> = { workspace: BuildingsIcon, person: UserIcon, site: GlobeIcon };
const GROUPS: Record<OfficeSearchHit["kind"] | "page", string> = { page: "Go to", workspace: "Workspaces", person: "People", site: "Sites" };

interface Row {
  id: string;
  group: keyof typeof GROUPS;
  label: string;
  hint?: string;
  icon: Icon;
  href: string;
}

type Remote = { state: "idle" } | { state: "searching"; query: string } | { state: "done"; query: string; hits: OfficeSearchHit[] } | { state: "failed"; message: string };

const noSubscribe = () => () => {};

/** The header button: a full search field on wide screens, an icon on phones. */
export function OfficeSearchTrigger() {
  const shortcut = useSyncExternalStore(noSubscribe, () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"), () => "Ctrl K");
  const open = () => window.dispatchEvent(new Event(OPEN_EVENT));
  return (
    <>
      <span className="hidden md:block">
        <button
          type="button"
          onClick={open}
          className="flex h-11 w-72 items-center gap-2.5 rounded-full border border-line bg-surface px-4 text-sm text-ink-3 shadow-e1 transition-colors duration-150 hover:text-ink"
        >
          <MagnifyingGlassIcon size={16} aria-hidden />
          <span className="flex-1 truncate text-left">Search workspaces, people, sites</span>
          <kbd className="rounded-full border border-line px-1.5 font-mono text-xs">{shortcut}</kbd>
        </button>
      </span>
      <span className="md:hidden">
        <button type="button" onClick={open} aria-label="Search" className="flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-e1">
          <MagnifyingGlassIcon size={18} aria-hidden />
        </button>
      </span>
    </>
  );
}

/**
 * Office Space quick search: Ctrl or Cmd+K anywhere in the console. Pages
 * match as you type; workspaces, people and sites come from the server once
 * there are two letters. It only navigates, so every rule still applies on
 * the page it opens.
 */
export function OfficeSearch() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<Remote>({ state: "idle" });
  const listId = useId();

  const close = () => dialog.current?.close();

  useEffect(() => {
    const show = () => {
      setQuery("");
      setActive(0);
      setRemote({ state: "idle" });
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
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const search = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    const q = text.trim();
    const ticket = ++latest.current;
    if (q.length < MIN_CHARS) {
      setRemote({ state: "idle" });
      return;
    }
    setRemote({ state: "searching", query: q });
    timer.current = setTimeout(async () => {
      const r = await searchOfficeAction(q).catch(() => ({ ok: false as const, message: "Search isn't answering right now. The pages still work." }));
      // A slower answer to an older query never replaces a newer one.
      if (ticket !== latest.current) return;
      setRemote(r.ok ? { state: "done", query: q, hits: r.hits } : { state: "failed", message: r.message });
    }, DEBOUNCE_MS);
  };

  const rows = useMemo(() => {
    const typed = query.trim();
    const pages: Row[] = OFFICE_PAGES.map((p, i) => ({ p, i, score: matchScore(typed, p.label, [p.short]) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, typed ? 4 : OFFICE_PAGES.length)
      .map(({ p }) => ({ id: p.href, group: "page", label: p.label, icon: PAGE_ICONS[p.href], href: p.href }));
    const hits: Row[] = remote.state === "done" ? remote.hits.map((h) => ({ id: h.id, group: h.kind, label: h.label, hint: h.hint, icon: HIT_ICONS[h.kind], href: h.href })) : [];
    // Records first once there are any: that's what a search is usually for.
    return hits.length ? [...hits, ...pages] : pages;
  }, [query, remote]);

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const current = Math.min(active, Math.max(0, rows.length - 1));
  const optionId = (i: number) => `${listId}-${i}`;
  const typed = query.trim();
  const status =
    remote.state === "searching"
      ? "Searching"
      : remote.state === "failed"
        ? remote.message
        : remote.state === "done" && remote.hits.length === 0
          ? `No workspace, person or site matches "${remote.query}".`
          : typed.length > 0 && typed.length < MIN_CHARS
            ? `Type ${MIN_CHARS} or more letters to search workspaces, people and sites.`
            : "";

  return (
    <dialog
      ref={dialog}
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
      aria-label="Search Office Space"
      className="m-0 mx-auto mt-[10dvh] w-[min(640px,calc(100vw-2rem))] max-w-none overflow-hidden rounded-lg border border-line bg-surface p-0 text-ink shadow-e3 backdrop:bg-ink/25 backdrop:backdrop-blur-sm open:motion-safe:animate-[usage-in_160ms_cubic-bezier(0.16,1,0.3,1)_both]"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <MagnifyingGlassIcon size={18} className="shrink-0 text-ink-3" aria-hidden />
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            search(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (rows.length) setActive((current + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const chosen = rows[current];
              if (chosen) go(chosen.href);
            }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={rows.length ? optionId(current) : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          maxLength={100}
          placeholder="Search workspaces, people, sites"
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-3"
        />
        <kbd className="hidden rounded-full border border-line px-1.5 font-mono text-xs text-ink-3 sm:inline">Esc</kbd>
      </div>
      <p aria-live="polite" className={status ? "flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs text-ink-3" : "sr-only"}>
        {remote.state === "searching" ? <span aria-hidden className="size-1.5 rounded-full bg-accent motion-safe:animate-pulse" /> : null}
        {status}
      </p>
      <ul id={listId} role="listbox" aria-label="Results" className="max-h-[min(60dvh,460px)] overflow-y-auto p-2">
        {rows.map((r, i) => {
          const showGroup = i === 0 || rows[i - 1]!.group !== r.group;
          return (
            <li key={r.id} role="presentation">
              {showGroup ? <p className="px-3 pb-1 pt-2 text-xs font-medium text-ink-3">{GROUPS[r.group]}</p> : null}
              <div
                id={optionId(i)}
                role="option"
                aria-selected={i === current}
                onMouseMove={() => setActive(i)}
                onClick={() => go(r.href)}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-3 text-[0.90625rem] ${i === current ? "bg-surface-raised text-ink" : "text-ink-2"}`}
              >
                <r.icon size={17} weight={i === current ? "bold" : "regular"} className="shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                {r.hint ? <span className="max-w-[45%] shrink-0 truncate text-xs text-ink-3">{r.hint}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="hidden border-t border-line px-4 py-2.5 text-xs text-ink-3 sm:block">Arrow keys to move, Enter to open. Searching changes nothing.</p>
    </dialog>
  );
}
