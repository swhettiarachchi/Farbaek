"use client";

/**
 * Farbaek Chat's workspace (stage 199, ADR 0213): the chat's own full-screen frame, with the sidebar (a drawer on phones), the
 * dialogs every page shares, toasts and keyboard shortcuts. It holds the conversation list, so a new chat or a new name shows in
 * the sidebar the moment the server says so.
 */
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChatModelOption } from "@/core/chat/models";
import type { ConversationSummary } from "@/core/chat/protocol";
import { ConfirmDialog, RenameDialog, SettingsDialog, ShareDialog } from "./dialogs";
import type { Theme } from "@/core/theme/theme";
import { setChatPrefs, useChatPrefs } from "./prefs";
import { ToastProvider, useToast } from "./primitives";
import { Sidebar } from "./sidebar";
import { useKeyboardViewport } from "./use-viewport";
import { archiveChatAction, deleteChatAction, pinChatAction, renameChatAction } from "@/app/app/chat/actions";

export interface ChatAvailabilityView {
  off: string | null;
  imagesOff: string | null;
  models: ChatModelOption[];
  percent: number | null;
  imagePercent: number | null;
  resetsAt: string | null;
  period: "trial" | "month" | null;
}

export interface ChatShellProps {
  conversations: ConversationSummary[];
  projects: { id: string; name: string }[];
  availability: ChatAvailabilityView;
  /** The look the server read (ADR 0227), for Chat's settings to show as chosen. */
  theme: Theme;
  demo: boolean;
  user: { email: string };
  workspaceName: string;
  planLabel: string;
  signOut: (() => Promise<void>) | null;
  children: ReactNode;
}

interface ChatContextValue {
  availability: ChatAvailabilityView;
  conversations: ConversationSummary[];
  projects: { id: string; name: string }[];
  demo: boolean;
  upsert(c: Partial<ConversationSummary> & { id: string }): void;
  remove(id: string): void;
  openDrawer(): void;
  share(c: { id: string; title: string; shared: boolean }): void;
  rename(c: { id: string; title: string }): void;
  confirmDelete(c: { id: string; title: string }): void;
  archive(c: { id: string; title: string }, archived: boolean): void;
  pin(c: { id: string }, pinned: boolean): void;
  openSettings(): void;
  /** The conversation open now, so deleting it leaves the page. */
  setActive(id: string | null): void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const v = useContext(ChatContext);
  if (!v) throw new Error("useChat outside ChatShell");
  return v;
}

export function ChatShell(props: ChatShellProps) {
  return (
    <ToastProvider>
      <Shell {...props} />
    </ToastProvider>
  );
}

function Shell({ conversations: initial, projects, availability, theme, demo, user, workspaceName, planLabel, signOut, children }: ChatShellProps) {
  const router = useRouter();
  const toast = useToast();
  const prefs = useChatPrefs();
  const root = useRef<HTMLDivElement>(null);
  const [conversations, setConversations] = useState(initial);
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState<
    | { kind: "share"; id: string; title: string; shared: boolean }
    | { kind: "rename"; id: string; title: string }
    | { kind: "delete"; id: string; title: string }
    | { kind: "settings" }
    | null
  >(null);
  const active = useRef<string | null>(null);
  useKeyboardViewport(root);

  const upsert = useCallback((c: Partial<ConversationSummary> & { id: string }) => {
    setConversations((list) => {
      const at = list.findIndex((x) => x.id === c.id);
      if (at < 0) return [{ title: "New chat", pinned: false, archived: false, projectId: null, shared: false, updatedAt: new Date().toISOString(), ...c }, ...list];
      const next = [...list];
      next[at] = { ...next[at]!, ...c };
      // A conversation with news moves to the top.
      if (c.updatedAt) next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return next;
    });
  }, []);
  const remove = useCallback((id: string) => setConversations((list) => list.filter((x) => x.id !== id)), []);

  const archive = useCallback(
    async (c: { id: string; title: string }, archived: boolean) => {
      const r = await archiveChatAction(c.id, archived);
      if (!r.ok) {
        toast({ text: r.message, tone: "error" });
        return;
      }
      if (archived) {
        remove(c.id);
        toast({
          text: `Archived ${c.title ? `“${c.title.slice(0, 40)}”` : "the chat"}.`,
          tone: "info",
          action: {
            label: "Undo",
            run: () => {
              void archiveChatAction(c.id, false).then((u) => {
                if (u.ok) upsert({ id: c.id, title: c.title, archived: false });
                else toast({ text: u.message, tone: "error" });
              });
            },
          },
        });
        if (active.current === c.id) router.push("/app/chat");
      } else {
        upsert({ id: c.id, title: c.title, archived: false, updatedAt: new Date().toISOString() });
        toast({ text: "Back in your chats.", tone: "info" });
      }
    },
    [remove, router, toast, upsert],
  );

  const pin = useCallback(
    async (c: { id: string }, pinned: boolean) => {
      upsert({ id: c.id, pinned });
      const r = await pinChatAction(c.id, pinned);
      if (!r.ok) {
        upsert({ id: c.id, pinned: !pinned });
        toast({ text: r.message, tone: "error" });
      }
    },
    [toast, upsert],
  );

  // Shortcuts: new chat, find a chat, fold the sidebar. Ctrl on Windows and Linux, Command on a Mac.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || !e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === "o") {
        e.preventDefault();
        router.push("/app/chat");
      } else if (key === "f") {
        e.preventDefault();
        if (window.matchMedia("(min-width: 64rem)").matches) {
          setChatPrefs({ sidebarFolded: false });
          window.setTimeout(() => document.getElementById("chat-search")?.focus(), 0);
        } else {
          setDrawer(true);
          window.setTimeout(() => document.getElementById("chat-search-drawer")?.focus(), 50);
        }
      } else if (key === "s") {
        e.preventDefault();
        setChatPrefs({ sidebarFolded: !prefs.sidebarFolded });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prefs.sidebarFolded]);

  const value = useMemo<ChatContextValue>(
    () => ({
      availability,
      conversations,
      projects,
      demo,
      upsert,
      remove,
      openDrawer: () => setDrawer(true),
      share: (c) => setDialog({ kind: "share", ...c }),
      rename: (c) => setDialog({ kind: "rename", ...c }),
      confirmDelete: (c) => setDialog({ kind: "delete", ...c }),
      archive: (c, archived) => void archive(c, archived),
      pin: (c, pinned) => void pin(c, pinned),
      openSettings: () => setDialog({ kind: "settings" }),
      setActive: (id) => {
        active.current = id;
      },
    }),
    [availability, conversations, projects, demo, upsert, remove, archive, pin],
  );

  const sidebar = (inDrawer: boolean) => (
    <Sidebar
      inDrawer={inDrawer}
      onNavigate={() => setDrawer(false)}
      folded={!inDrawer && prefs.sidebarFolded}
      onFold={() => setChatPrefs({ sidebarFolded: !prefs.sidebarFolded })}
      user={user}
      workspaceName={workspaceName}
      planLabel={planLabel}
      signOut={signOut}
    />
  );

  return (
    <ChatContext.Provider value={value}>
      {/* On wide screens Chat is a rounded window on a pale stage, with the spectrum's light glowing from behind its edges
          (stage 202, as the homepage draws it). The light is still; while Farbaek AI answers it travels slowly round. */}
      <div ref={root} className="chat-root relative h-[var(--chat-vh,100dvh)] overflow-hidden bg-canvas text-ink lg:bg-canvas-2 lg:p-3 xl:p-4 2xl:p-5">
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block">
          <div className="chat-halo" />
          <div className="chat-halo-fade absolute inset-0" />
        </div>
        <a href="#chat-composer" className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-sm text-on-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
          Skip to the message box
        </a>
        <div className="relative flex h-full overflow-hidden bg-canvas lg:rounded-lg lg:border lg:border-line lg:shadow-e2">
        <div className="hidden h-full shrink-0 lg:flex">{sidebar(false)}</div>
        <Drawer open={drawer} onClose={() => setDrawer(false)}>
          {sidebar(true)}
        </Drawer>
        <main id="main" className="relative flex h-full min-w-0 flex-1 flex-col">
          {children}
        </main>
        </div>

        <ShareDialog state={dialog?.kind === "share" ? dialog : null} onClose={() => setDialog(null)} onShared={(id, shared) => upsert({ id, shared })} />
        <RenameDialog
          state={dialog?.kind === "rename" ? dialog : null}
          onClose={() => setDialog(null)}
          onRename={async (id, title) => {
            const r = await renameChatAction(id, title);
            if (r.ok) {
              upsert({ id, title });
              setDialog(null);
            }
            return r.ok ? null : r.message;
          }}
        />
        <ConfirmDialog
          state={dialog?.kind === "delete" ? dialog : null}
          onClose={() => setDialog(null)}
          onConfirm={async (id) => {
            const r = await deleteChatAction(id);
            if (!r.ok) return r.message;
            remove(id);
            setDialog(null);
            toast({ text: "Chat deleted.", tone: "info" });
            if (active.current === id) router.push("/app/chat");
            return null;
          }}
        />
        <SettingsDialog
          open={dialog?.kind === "settings"}
          onClose={() => setDialog(null)}
          theme={theme}
          availability={availability}
          planLabel={planLabel}
        />
      </div>
    </ChatContext.Provider>
  );
}

/** The sidebar as a drawer on phones and tablets: a modal dialog from the left; drag it left or press outside to close it. */
function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; id: number } | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label="Your chats"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-0 h-[100dvh] max-h-none w-[min(86vw,20rem)] max-w-none overflow-visible bg-transparent p-0 backdrop:bg-ink/35 lg:hidden open:motion-safe:animate-[chat-drawer-in_240ms_cubic-bezier(0.16,1,0.3,1)_both]"
    >
      <div
        ref={panel}
        className="h-full touch-pan-y"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          drag.current = { x: e.clientX, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId || !panel.current) return;
          const dx = Math.min(0, e.clientX - d.x);
          if (dx < -8) panel.current.style.transform = `translateX(${dx}px)`;
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || !panel.current) return;
          const dx = e.clientX - d.x;
          panel.current.style.transform = "";
          if (dx < -72) onClose();
        }}
        onPointerCancel={() => {
          drag.current = null;
          if (panel.current) panel.current.style.transform = "";
        }}
      >
        {open ? children : null}
      </div>
    </dialog>
  );
}
