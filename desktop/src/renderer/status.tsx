import { InfoIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { STATUS_KINDS, type Status } from "@/components/ui/status-badge";

export type { Status };

/**
 * Where something stands, as on the web (ADR 0183): the web's thirteen kinds, each with its own icon, colour and
 * border, drawn with this window's stylesheet (`.badge.kind-*`). The icons come from the web's table, so a kind
 * looks the same in both places.
 */
export function StatusBadge({ kind, children }: { kind: Status; children: ReactNode }) {
  const { icon: KindIcon, weight } = STATUS_KINDS[kind];
  return (
    <span className={`badge kind-${kind}`}>
      <KindIcon size={14} weight={weight} className={kind === "working" ? "spin" : undefined} aria-hidden />
      {children}
    </span>
  );
}

/** A kind's icon on its own, in its colour, for step lines and rows. */
export function StatusGlyph({ kind, size = 16 }: { kind: Status; size?: 14 | 16 | 20 | 24 }) {
  const { icon: KindIcon, weight } = STATUS_KINDS[kind];
  return <KindIcon size={size} weight={weight} className={`glyph kind-${kind}${kind === "working" ? " spin" : ""}`} aria-hidden />;
}

/** Something went wrong: what happened and what to do, with the failed colour's warning mark. */
export function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="alert">
      <WarningCircleIcon size={16} weight="fill" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** A note on a neutral surface; the icon's colour says which kind: steel for information, burnt orange for a warning. */
export function Notice({ tone = "info", children }: { tone?: "info" | "warning"; children: ReactNode }) {
  const NoticeIcon = tone === "info" ? InfoIcon : WarningCircleIcon;
  return (
    <p className={`notice notice-${tone}`}>
      <NoticeIcon size={16} weight="fill" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
