"use client";

/**
 * Small pieces Farbaek Chat is built from (stage 199): an icon button, a menu that opens beside its button and can leave a
 * scrolling list, a dialog on the native <dialog> element (focus kept inside, Escape closes, the page behind is inert), and
 * polite toasts that never take focus. Motion is transform and opacity only, and stops under reduced motion.
 */
import { CheckCircleIcon, WarningCircleIcon, XIcon, type Icon } from "@phosphor-icons/react";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function IconButton({
  label,
  icon: Glyph,
  onClick,
  pressed,
  disabled,
  className = "",
  size = 16,
  tone = "quiet",
  ...rest
}: {
  label: string;
  icon: Icon;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  size?: 16 | 20;
  tone?: "quiet" | "solid";
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "className">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`tap inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 ease-standard active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 ${
        tone === "solid" ? "bg-primary text-on-primary hover:bg-primary-hover" : pressed ? "bg-surface-raised text-ink" : "text-ink-2 hover:bg-surface-raised hover:text-ink"
      } ${className}`}
      {...rest}
    >
      <Glyph size={size} weight={size === 16 ? "bold" : "regular"} aria-hidden />
    </button>
  );
}

// ---------------------------------------------------------------- menu

const MenuClose = createContext<() => void>(() => {});

/** Closes the menu a custom item sits in (focus goes back to its button). */
export function useMenuClose() {
  return useContext(MenuClose);
}

export interface MenuItem {
  label: string;
  icon?: Icon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Shown under the label, for a reason it's off or what it does. */
  hint?: string;
  checked?: boolean;
}

/**
 * A menu button and its list. The list is placed on the page (not inside the button's scrolling parent), beside the button, and
 * flips above it when there isn't room below. Arrow keys move through it, Escape closes it and focus returns to the button.
 */
export function Menu({ label, trigger, items, align = "end", children }: { label: string; trigger: (props: { ref: React.Ref<HTMLButtonElement>; open: boolean; toggle: () => void; id: string }) => ReactNode; items?: MenuItem[]; align?: "start" | "end"; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  /** Opens beside the button, placed from where the button is now; flips above it when there isn't room below. */
  const toggle = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const width = 256;
    const below = window.innerHeight - r.bottom;
    const up = below < 280 && r.top > below;
    const left = align === "end" ? Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width)) : Math.max(8, Math.min(window.innerWidth - width - 8, r.left));
    setPlace({ top: up ? r.top - 6 : r.bottom + 6, left, up });
    setOpen(true);
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const first = panel.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"]), input, button');
    first?.focus();
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    const onScroll = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onScroll);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open, close]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const list = [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemradio"]') ?? [])];
    if (list.length === 0) return;
    e.preventDefault();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : e.key === "ArrowDown" ? (at + 1) % list.length : (at - 1 + list.length) % list.length;
    list[next]!.focus();
  };

  return (
    <>
      {trigger({ ref: button, open, toggle, id })}
      {open && place
        ? createPortal(
            <div
              ref={panel}
              id={id}
              role="menu"
              aria-label={label}
              onKeyDown={onKeyDown}
              style={{ top: place.top, left: place.left, transform: place.up ? "translateY(-100%)" : undefined }}
              className="fixed z-[60] w-64 max-w-[calc(100vw-1rem)] rounded-md border border-line bg-surface p-1.5 text-ink shadow-e3 motion-safe:animate-[chat-pop_160ms_cubic-bezier(0.16,1,0.3,1)_both]"
            >
              {children
                ? <MenuClose.Provider value={close}>{children}</MenuClose.Provider>
                : items?.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      aria-disabled={item.disabled || undefined}
                      onClick={() => {
                        if (item.disabled) return;
                        close();
                        item.onSelect();
                      }}
                      className={`flex min-h-10 w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm outline-none transition-colors duration-100 focus-visible:bg-surface-raised aria-disabled:cursor-not-allowed aria-disabled:opacity-50 pointer-coarse:min-h-11 ${
                        item.danger ? "text-failed hover:bg-failed/10" : "hover:bg-surface-raised"
                      }`}
                    >
                      {item.icon ? <item.icon size={16} weight="bold" className={item.danger ? "" : "text-ink-3"} aria-hidden /> : null}
                      <span className="min-w-0 flex-1">
                        <span className="block">{item.label}</span>
                        {item.hint ? <span className="block text-xs text-ink-3">{item.hint}</span> : null}
                      </span>
                      {item.checked ? <CheckCircleIcon size={16} weight="fill" className="text-accent" aria-label="Chosen" /> : null}
                    </button>
                  ))}
            </div>,
            document.querySelector(".chat-root") ?? document.body,
          )
        : null}
    </>
  );
}

// ---------------------------------------------------------------- dialog

/** A modal dialog on the native element: Escape and the close button close it, and focus returns where it was. */
export function Dialog({ open, onClose, title, description, children, wide = false }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A press on the backdrop (the dialog element itself, outside its panel) closes it.
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100vw-2rem)] ${wide ? "max-w-3xl" : "max-w-md"} overflow-visible rounded-lg bg-transparent p-0 text-ink backdrop:bg-ink/30 backdrop:backdrop-blur-sm open:motion-safe:animate-[chat-pop_200ms_cubic-bezier(0.16,1,0.3,1)_both]`}
    >
      {open ? (
        <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg border border-line bg-surface p-5 shadow-e3 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-title-4 font-medium tracking-[-0.02em]">
                {title}
              </h2>
              {description ? <p className="mt-1 text-sm leading-relaxed text-ink-2">{description}</p> : null}
            </div>
            <IconButton label="Close" icon={XIcon} onClick={onClose} className="-mr-2 -mt-2" />
          </div>
          <div className="mt-4">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}

// ---------------------------------------------------------------- toasts

interface Toast {
  id: number;
  text: string;
  tone: "info" | "error";
  action?: { label: string; run: () => void };
}

const ToastContext = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

/** Toasts above the composer: read out politely, never focused, gone after six seconds or when closed. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = next.current++;
    setToasts((list) => [...list.slice(-2), { ...t, id }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.action ? 8_000 : 6_000);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--chat-composer,7rem)+0.75rem)] z-[70] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full border border-line bg-surface py-1.5 pl-4 pr-1.5 text-sm text-ink shadow-e3 motion-safe:animate-[chat-pop_200ms_cubic-bezier(0.16,1,0.3,1)_both]">
            {t.tone === "error" ? <WarningCircleIcon size={16} weight="fill" className="shrink-0 text-failed" aria-hidden /> : <CheckCircleIcon size={16} weight="fill" className="shrink-0 text-verified" aria-hidden />}
            <span className="min-w-0 flex-1 py-1.5">{t.text}</span>
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  t.action!.run();
                  setToasts((list) => list.filter((x) => x.id !== t.id));
                }}
                className="tap min-h-9 rounded-full px-3 font-medium text-accent hover:bg-surface-raised"
              >
                {t.action.label}
              </button>
            ) : null}
            <button type="button" aria-label="Close" onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))} className="tap inline-flex size-9 items-center justify-center rounded-full text-ink-3 hover:bg-surface-raised hover:text-ink">
              <XIcon size={14} weight="bold" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
