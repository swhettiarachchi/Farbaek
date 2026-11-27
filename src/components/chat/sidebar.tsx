"use client";

/**
 * Farbaek Chat's sidebar (stage 199): a new chat, search across names and messages, pinned chats, then the rest by when they were
 * last used, chats in the workspace's projects, archived chats, the images the AI made, and the person's plan, settings and way
 * back to Farbaek. Folds to a rail on a large screen; on phones it's the drawer.
 */
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ArrowUUpLeftIcon,
  CalendarCheckIcon,
  CreditCardIcon,
  DotsThreeIcon,
  FolderSimpleIcon,
  GearSixIcon,
  HouseIcon,
  HouseSimpleIcon,
  ChatCircleTextIcon,
  VideoCameraIcon,
  BlocksIcon,
  ImageSquareIcon,
  ImagesIcon,
  MagnifyingGlassIcon,
  NotePencilIcon,
  PencilSimpleIcon,
  PushPinIcon,
  PushPinSlashIcon,
  ShareNetworkIcon,
  SidebarSimpleIcon,
  SignOutIcon,
  TrashIcon,
  UserCircleIcon,
  XIcon,
} from "@/components/icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationSummary } from "@/core/chat/protocol";
import { BrandLogo } from "@/components/brand/brand-logo";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";

/** Farbaek AI's spaces, one press from any chat. Their colours are for their own pages; in a list they are words and outlines (ADR 0286). */
const SPACE_LINKS = [
  { href: "/app/chat", label: "Chat", icon: ChatCircleTextIcon },
  { href: "/app/images", label: "Images", icon: ImageSquareIcon },
  { href: "/app/video", label: "Video", icon: VideoCameraIcon },
  { href: "/app/build", label: "Build", icon: BlocksIcon },
] as const;

const SPACE_ROW = "group/space flex min-h-10 items-center gap-3 rounded-full px-3.5 text-sm text-ink transition-[background-color,box-shadow] duration-150 hover:bg-surface aria-[current=page]:bg-surface aria-[current=page]:font-medium aria-[current=page]:shadow-e1 pointer-coarse:min-h-12 max-md:text-base max-md:font-medium";
import { listChatsAction, moveChatAction } from "@/app/app/chat/actions";
import { useChat } from "./chat-shell";
import { IconButton, Menu, useToast, type MenuItem } from "./primitives";

const DAY = 86_400_000;

/** Today, Yesterday, Previous 7 days, Previous 30 days, then the month. */
export function groupLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return "Today";
  if (t >= startOfToday - DAY) return "Yesterday";
  if (t >= startOfToday - 7 * DAY) return "Previous 7 days";
  if (t >= startOfToday - 30 * DAY) return "Previous 30 days";
  return d.toLocaleDateString("en-GB", { month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

export function Sidebar({
  inDrawer,
  onNavigate,
  folded,
  onFold,
  user,
  workspaceName,
  planLabel,
  signOut,
}: {
  inDrawer: boolean;
  onNavigate: () => void;
  folded: boolean;
  onFold: () => void;
  user: { email: string };
  workspaceName: string;
  planLabel: string;
  signOut: (() => Promise<void>) | null;
}) {
  const chat = useChat();
  const toast = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"recent" | "archived">("recent");
  const [project, setProject] = useState<string | null>(null);
  const [archived, setArchived] = useState<ConversationSummary[] | null>(null);
  const [found, setFound] = useState<{ chats: ConversationSummary[]; matches: { conversationId: string; snippet: string }[] } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreDone, setMoreDone] = useState(chat.conversations.length < 60);
  const [moving, setMoving] = useState<ConversationSummary | null>(null);
  const searchSeq = useRef(0);

  // Searching the server for names and words in messages, a moment after typing stops.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || chat.demo) return;
    const seq = ++searchSeq.current;
    const t = window.setTimeout(() => {
      void listChatsAction({ archived: view === "archived", before: null, search: q }).then((r) => {
        if (seq !== searchSeq.current) return;
        if (r.ok) setFound(r.value);
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [query, view, chat.demo]);

  const source = useMemo(() => (view === "archived" ? (archived ?? []) : chat.conversations), [view, archived, chat.conversations]);
  const q = query.trim().toLowerCase();
  const list = useMemo(() => {
    let items = source.filter((c) => (project ? c.projectId === project : true));
    if (q) {
      const fromServer = new Set(found?.chats.map((c) => c.id) ?? []);
      items = items.filter((c) => c.title.toLowerCase().includes(q) || fromServer.has(c.id));
      for (const c of found?.chats ?? []) if (!items.some((x) => x.id === c.id) && (!project || c.projectId === project)) items.push(c);
    }
    return items;
  }, [source, project, q, found]);
  const matches = q.length >= 2 ? (found?.matches ?? []).filter((m) => !list.some((c) => c.id === m.conversationId)) : [];

  const pinned = view === "recent" && !q ? list.filter((c) => c.pinned) : [];
  const rest = view === "recent" && !q ? list.filter((c) => !c.pinned) : list;
  const groups = useMemo(() => {
    const out: { label: string; items: ConversationSummary[] }[] = [];
    for (const c of rest) {
      const label = q ? "Results" : view === "archived" ? "Archived" : groupLabel(c.updatedAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(c);
      else out.push({ label, items: [c] });
    }
    return out;
  }, [rest, q, view]);

  const projectsWithChats = chat.projects.filter((p) => chat.conversations.some((c) => c.projectId === p.id));
  const usage = chat.availability.percent;

  const openArchived = async () => {
    setView("archived");
    if (archived || chat.demo) return;
    const r = await listChatsAction({ archived: true, before: null, search: null });
    if (r.ok) setArchived(r.value.chats);
    else toast({ text: r.message, tone: "error" });
  };

  const loadMore = async () => {
    const last = chat.conversations[chat.conversations.length - 1];
    if (!last) return;
    setLoadingMore(true);
    const r = await listChatsAction({ archived: false, before: last.updatedAt, search: null });
    setLoadingMore(false);
    if (!r.ok) {
      toast({ text: r.message, tone: "error" });
      return;
    }
    r.value.chats.forEach((c) => chat.upsert(c));
    if (r.value.chats.length < 60) setMoreDone(true);
  };

  if (folded) {
    return (
      <nav aria-label="Chats" className="flex h-full w-16 flex-col items-center gap-1 border-r border-line bg-canvas-2 py-3">
        <Link href="/app" aria-label="Farbaek, Home" className="mb-2 flex min-h-11 items-center">
          <BrandLogo height={30} />
        </Link>
        <IconButton label="Open the sidebar" icon={SidebarSimpleIcon} onClick={onFold} size={20} />
        <Link href="/app/chat" aria-label="New chat" title="New chat" className="tap inline-flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-raised hover:text-ink">
          <NotePencilIcon size={20} weight="bold" aria-hidden />
        </Link>
        <IconButton
          label="Search chats"
          icon={MagnifyingGlassIcon}
          size={20}
          onClick={() => {
            onFold();
            window.setTimeout(() => document.getElementById("chat-search")?.focus(), 0);
          }}
        />
        {SPACE_LINKS.slice(1).map((s) => (
          <Link key={s.href} href={s.href} aria-label={s.label} title={s.label} className="tap inline-flex size-10 items-center justify-center rounded-full hover:bg-surface-raised">
            <s.icon size={20} weight="bold" className="text-ink" aria-hidden />
          </Link>
        ))}
        <div className="mt-auto">
          <IconButton label="Settings" icon={GearSixIcon} size={20} onClick={chat.openSettings} />
        </div>
      </nav>
    );
  }

  const searchId = inDrawer ? "chat-search-drawer" : "chat-search";
  return (
    <nav aria-label="Chats" className={`flex h-full flex-col bg-canvas-2 ${inDrawer ? "w-full border-r border-line shadow-e3" : "w-[17.5rem] border-r border-line motion-safe:animate-[chat-fade_200ms_ease-out_both]"}`}>
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <Link href="/app" className="flex min-h-11 items-center gap-2 rounded-full pl-1 pr-2" aria-label="Farbaek, Home" onClick={onNavigate}>
          <BrandLogo height={30} />
          <span className="text-base font-medium tracking-[-0.02em]">Farbaek AI</span>
        </Link>
        {inDrawer ? <IconButton label="Close" icon={XIcon} onClick={onNavigate} size={20} /> : <IconButton label="Fold the sidebar" icon={SidebarSimpleIcon} onClick={onFold} size={20} />}
      </div>

      <div className="grid gap-2 px-3">
        <Link href="/app/chat" onClick={onNavigate} className={buttonClasses("secondary", "sm", "w-full justify-start")}>
          <NotePencilIcon size={20} weight="bold" aria-hidden /> New chat
        </Link>
        <div className="relative">
          <MagnifyingGlassIcon size={16} weight="bold" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
          <label htmlFor={searchId} className="sr-only">
            Search chats
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length < 2) setFound(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                setQuery("");
                setFound(null);
              }
            }}
            placeholder="Search chats"
            enterKeyHint="search"
            autoComplete="off"
            className={inputClasses("w-full rounded-full bg-surface pl-10 lg:pointer-fine:pl-10")}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-0.5 px-3">
        {/* Home leads, as in the app's own sidebar (ADR 0230): the two lists start the same way. */}
        <Link href="/app" onClick={onNavigate} className={SPACE_ROW}>
          <HouseSimpleIcon size={20} weight="bold" className="shrink-0 max-md:size-6" aria-hidden /> Home
        </Link>
        {SPACE_LINKS.map((s) => (
          <Link key={s.href} href={s.href} onClick={onNavigate} aria-current={s.href === "/app/chat" && pathname !== "/app/chat/images" ? "page" : undefined} className={SPACE_ROW}>
            <s.icon size={20} weight="bold" className="shrink-0 max-md:size-6" aria-hidden /> {s.label}
          </Link>
        ))}
        {/* Work Farbaek does by itself, one press from where people ask for it (ADR 0286). */}
        <Link href="/app/scheduled" onClick={onNavigate} className={SPACE_ROW}>
          <CalendarCheckIcon size={20} weight="bold" className="shrink-0 max-md:size-6" aria-hidden /> Scheduled
        </Link>
      </div>

      <div className="mt-3 grid gap-0.5 px-3">
        <Link
          href="/app/chat/images"
          onClick={onNavigate}
          aria-current={pathname === "/app/chat/images" ? "page" : undefined}
          className="flex min-h-10 items-center gap-3 rounded-full px-3.5 text-sm text-ink hover:bg-surface aria-[current=page]:bg-surface aria-[current=page]:shadow-e1 pointer-coarse:min-h-12 max-md:text-base max-md:font-medium"
        >
          <ImagesIcon size={20} weight="bold" className="shrink-0 max-md:size-6" aria-hidden /> Pictures from chats
        </Link>
        {view === "archived" ? (
          <button type="button" onClick={() => setView("recent")} className="flex min-h-10 items-center gap-3 rounded-full px-3.5 text-left text-sm text-ink hover:bg-surface pointer-coarse:min-h-12 max-md:text-base max-md:font-medium">
            <ArrowLeftIcon size={20} weight="bold" className="shrink-0 max-md:size-6" aria-hidden /> Back to your chats
          </button>
        ) : (
          <button type="button" onClick={() => void openArchived()} className="flex min-h-10 items-center gap-3 rounded-full px-3.5 text-left text-sm text-ink hover:bg-surface pointer-coarse:min-h-12 max-md:text-base max-md:font-medium">
            <ArchiveIcon size={20} weight="bold" className="shrink-0 max-md:size-6" aria-hidden /> Archived
          </button>
        )}
      </div>

      {projectsWithChats.length > 0 && view === "recent" ? (
        <div className="mt-3 px-3">
          <p className="px-3.5 pb-1 text-xs font-medium text-ink-3">Projects</p>
          <div className="flex flex-wrap gap-1.5 px-2">
            {projectsWithChats.slice(0, 8).map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={project === p.id}
                onClick={() => setProject(project === p.id ? null : p.id)}
                className="tap inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-medium text-ink-2 hover:border-line-2 aria-pressed:border-accent aria-pressed:text-accent"
              >
                <FolderSimpleIcon size={14} weight="bold" aria-hidden />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 [scrollbar-width:thin]">
        {view === "archived" && archived === null && !chat.demo ? <p className="px-3.5 py-2 text-sm text-ink-3">Reading archived chats…</p> : null}
        {pinned.length > 0 ? <Group label="Pinned" items={pinned} active={pathname} onNavigate={onNavigate} onMove={setMoving} archivedView={false} /> : null}
        {groups.map((g) => (
          <Group key={g.label} label={g.label} items={g.items} active={pathname} onNavigate={onNavigate} onMove={setMoving} archivedView={view === "archived"} />
        ))}
        {matches.length > 0 ? (
          <div className="mt-3">
            <p className="px-3.5 pb-1 text-xs font-medium text-ink-3">In messages</p>
            <ul className="grid gap-0.5">
              {matches.map((m) => {
                const c = [...chat.conversations, ...(found?.chats ?? [])].find((x) => x.id === m.conversationId);
                return (
                  <li key={m.conversationId}>
                    <Link href={`/app/chat/${m.conversationId}`} onClick={onNavigate} className="block rounded-sm px-3.5 py-2 hover:bg-surface">
                      <span className="block truncate text-sm text-ink">{c?.title ?? "A chat"}</span>
                      <span className="line-clamp-2 text-xs text-ink-3">{m.snippet}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {list.length === 0 && !(view === "archived" && archived === null && !chat.demo) ? (
          <p className="px-3.5 py-3 text-sm leading-relaxed text-ink-3">{q ? "No chats match those words." : view === "archived" ? "Nothing is archived. Archived chats wait here, out of the way." : "Your chats will show here."}</p>
        ) : null}
        {view === "recent" && !q && !project && !moreDone && !chat.demo ? (
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className={buttonClasses("ghost", "sm", "mt-2 w-full")}>
            {loadingMore ? "Reading older chats…" : "Show older chats"}
          </button>
        ) : null}
      </div>

      <div className="border-t border-line px-3 py-3">
        <div className="px-1.5">
          <p className="truncate text-xs font-medium text-ink-2">{planLabel}</p>
          {usage !== null ? (
            <>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-label="AI usage this period" aria-valuenow={usage} aria-valuemin={0} aria-valuemax={100}>
                <div className={`h-full rounded-full ${usage >= 90 ? "bg-caution" : "bg-accent"}`} style={{ width: `${Math.min(100, Math.max(2, usage))}%` }} />
              </div>
              <p className="mt-1 text-xs text-ink-3">
                <span className="tabular">{usage}%</span> of this {chat.availability.period === "trial" ? "trial's" : "month's"} AI usage used.
              </p>
            </>
          ) : null}
        </div>
        <Menu
          label="Account"
          align="start"
          items={[
            { label: "Settings", icon: GearSixIcon, onSelect: chat.openSettings },
            { label: "Plan and usage", icon: CreditCardIcon, onSelect: () => router.push("/app/billing") },
            { label: "Your account and data", icon: UserCircleIcon, onSelect: () => router.push("/app/account") },
            { label: "Back to Farbaek", icon: HouseIcon, onSelect: () => router.push("/app") },
            ...(signOut ? [{ label: "Sign out", icon: SignOutIcon, onSelect: () => void signOut() } satisfies MenuItem] : []),
          ]}
          trigger={({ ref, open, toggle, id }) => (
            <button
              ref={ref}
              type="button"
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={open ? id : undefined}
              onClick={toggle}
              className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-full px-1.5 text-left hover:bg-surface"
            >
              <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-on-primary">
                {(user.email[0] ?? "F").toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{user.email}</span>
                <span className="block truncate text-xs text-ink-3">{workspaceName}</span>
              </span>
              <DotsThreeIcon size={16} weight="bold" className="mr-2 shrink-0 text-ink-3" aria-hidden />
            </button>
          )}
        />
      </div>

      {moving ? (
        <MoveMenu
          chat={moving}
          projects={chat.projects}
          onClose={() => setMoving(null)}
          onMove={async (projectId) => {
            const r = await moveChatAction(moving.id, projectId);
            if (!r.ok) toast({ text: r.message, tone: "error" });
            else {
              chat.upsert({ id: moving.id, projectId });
              toast({ text: projectId ? `Moved to ${chat.projects.find((p) => p.id === projectId)?.name ?? "the project"}.` : "Taken out of its project.", tone: "info" });
            }
            setMoving(null);
          }}
        />
      ) : null}
    </nav>
  );
}

function Group({ label, items, active, onNavigate, onMove, archivedView }: { label: string; items: ConversationSummary[]; active: string | null; onNavigate: () => void; onMove: (c: ConversationSummary) => void; archivedView: boolean }) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="px-3.5 pb-1 text-xs font-medium text-ink-3">{label}</p>
      <ul className="grid gap-0.5">
        {items.map((c) => (
          <Item key={c.id} c={c} current={active === `/app/chat/${c.id}`} onNavigate={onNavigate} onMove={onMove} archivedView={archivedView} />
        ))}
      </ul>
    </div>
  );
}

function Item({ c, current, onNavigate, onMove, archivedView }: { c: ConversationSummary; current: boolean; onNavigate: () => void; onMove: (c: ConversationSummary) => void; archivedView: boolean }) {
  const chat = useChat();
  const items: MenuItem[] = chat.demo
    ? [{ label: "Sample chats can't be changed", disabled: true, onSelect: () => {}, hint: "The demo workspace is read-only." }]
    : [
        { label: "Rename", icon: PencilSimpleIcon, onSelect: () => chat.rename({ id: c.id, title: c.title }) },
        ...(archivedView ? [] : [{ label: c.pinned ? "Unpin" : "Pin to the top", icon: c.pinned ? PushPinSlashIcon : PushPinIcon, onSelect: () => chat.pin(c, !c.pinned) }]),
        { label: "Move to a project", icon: FolderSimpleIcon, onSelect: () => onMove(c), disabled: chat.projects.length === 0, hint: chat.projects.length === 0 ? "This workspace has no projects yet." : undefined },
        { label: c.shared ? "Sharing" : "Share", icon: ShareNetworkIcon, onSelect: () => chat.share({ id: c.id, title: c.title, shared: c.shared }) },
        archivedView ? { label: "Unarchive", icon: ArrowUUpLeftIcon, onSelect: () => chat.archive(c, false) } : { label: "Archive", icon: ArchiveIcon, onSelect: () => chat.archive(c, true) },
        { label: "Delete", icon: TrashIcon, danger: true, onSelect: () => chat.confirmDelete({ id: c.id, title: c.title }) },
      ];
  return (
    <li className="group relative">
      <Link
        href={`/app/chat/${c.id}`}
        onClick={onNavigate}
        aria-current={current ? "page" : undefined}
        className="flex min-h-10 items-center gap-2 rounded-full py-2 pl-3.5 pr-11 text-sm text-ink-2 transition-colors duration-100 hover:bg-surface hover:text-ink aria-[current=page]:bg-surface aria-[current=page]:font-medium aria-[current=page]:shadow-e1 aria-[current=page]:text-ink aria-[current=page]:shadow-e1 pointer-coarse:min-h-11"
      >
        {c.pinned ? <PushPinIcon size={14} weight="fill" className="shrink-0 text-ink-3" aria-label="Pinned" /> : null}
        <span className="min-w-0 flex-1 truncate">{c.title}</span>
        {c.shared ? <ShareNetworkIcon size={14} weight="bold" className="shrink-0 text-ink-3" aria-label="Shared" /> : null}
      </Link>
      <div className="absolute right-1 top-1/2 -translate-y-1/2">
        <Menu
          label={`${c.title}, actions`}
          items={items}
          trigger={({ ref, open, toggle, id }) => (
            <button
              ref={ref}
              type="button"
              aria-label={`Actions for ${c.title}`}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={open ? id : undefined}
              onClick={toggle}
              className={`tap inline-flex size-10 items-center justify-center rounded-full text-ink-3 hover:bg-surface-raised hover:text-ink focus-visible:opacity-100 pointer-coarse:opacity-100 ${open || current ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            >
              <DotsThreeIcon size={16} weight="bold" aria-hidden />
            </button>
          )}
        />
      </div>
    </li>
  );
}

/** Where a chat lives: one of the workspace's projects, or none. */
function MoveMenu({ chat, projects, onClose, onMove }: { chat: ConversationSummary; projects: { id: string; name: string }[]; onClose: () => void; onMove: (projectId: string | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={`Move ${chat.title}`}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[calc(100vw-2rem)] max-w-sm rounded-lg bg-transparent p-0 text-ink backdrop:bg-ink/30 open:motion-safe:animate-[chat-pop_200ms_cubic-bezier(0.16,1,0.3,1)_both]"
    >
      <div className="rounded-lg border border-line bg-surface p-5 shadow-e3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-title-4 font-medium tracking-[-0.02em]">Move to a project</h2>
          <IconButton label="Close" icon={XIcon} onClick={onClose} className="-mr-2 -mt-2" />
        </div>
        <p className="mt-1 text-sm text-ink-2">The chat stays yours and private. Its project just helps you find it.</p>
        <ul className="mt-4 grid max-h-72 gap-1 overflow-y-auto">
          <li>
            <button type="button" onClick={() => onMove(null)} aria-pressed={chat.projectId === null} className="flex min-h-11 w-full items-center gap-3 rounded-full px-3.5 text-left text-sm hover:bg-surface-raised aria-pressed:font-medium aria-pressed:text-accent">
              No project
            </button>
          </li>
          {projects.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onMove(p.id)} aria-pressed={chat.projectId === p.id} className="flex min-h-11 w-full items-center gap-3 rounded-full px-3.5 text-left text-sm hover:bg-surface-raised aria-pressed:font-medium aria-pressed:text-accent">
                <FolderSimpleIcon size={16} weight="bold" className="text-ink-3" aria-hidden />
                <span className="truncate">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
