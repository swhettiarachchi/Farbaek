import { ChatCircleDotsIcon, CheckCircleIcon } from "@phosphor-icons/react/ssr";
import { BrandLogo } from "@/components/brand/brand-logo";
import { LocalTime } from "@/components/ui/local-time";
import { CUSTOMER_STATUS_WORDS, type SupportStatus } from "@/core/support/support";
import type { SupportMessageView } from "@/server/workspace/support";

const STATUS_LOOK: Record<SupportStatus, { icon: typeof CheckCircleIcon | null; className: string }> = {
  waiting_on_farbaek: { icon: null, className: "bg-surface-raised text-ink-2" },
  waiting_on_you: { icon: ChatCircleDotsIcon, className: "bg-accent/[0.08] text-accent" },
  closed: { icon: CheckCircleIcon, className: "bg-surface-raised text-ink-3" },
};

/** A request's state in words with its own icon, never colour alone. */
export function SupportStatusChip({ status }: { status: SupportStatus }) {
  const look = STATUS_LOOK[status];
  return (
    <span className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${look.className}`}>
      {look.icon ? <look.icon size={14} weight="bold" aria-hidden /> : null}
      {CUSTOMER_STATUS_WORDS[status]}
    </span>
  );
}

/**
 * The conversation as the person sees it: their messages on the right, and
 * Farbaek's replies on the left under the logo. Text only, kept as written.
 */
export function SupportConversation({ messages }: { messages: readonly SupportMessageView[] }) {
  return (
    <ol className="grid gap-5" aria-label="Messages">
      {messages.map((m) =>
        m.fromStaff ? (
          <li key={m.id} className="grid max-w-[min(100%,620px)] gap-2 justify-self-start">
            <p className="flex items-center gap-2 text-xs text-ink-3">
              <BrandLogo height={18} />
              <span className="font-medium text-ink">Farbaek support</span>
              <span aria-hidden>·</span>
              <LocalTime iso={m.createdAt} />
            </p>
            <div className="whitespace-pre-wrap break-words rounded-md rounded-tl-sm border border-line bg-surface px-4 py-3 text-[0.9375rem] leading-relaxed text-ink shadow-e1">{m.body}</div>
          </li>
        ) : (
          <li key={m.id} className="grid max-w-[min(100%,620px)] gap-2 justify-self-end">
            <p className="flex items-center justify-end gap-2 text-xs text-ink-3">
              <span className="font-medium text-ink-2">You</span>
              <span aria-hidden>·</span>
              <LocalTime iso={m.createdAt} />
            </p>
            <div className="whitespace-pre-wrap break-words rounded-md rounded-tr-sm border border-accent/15 bg-accent/[0.05] px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">{m.body}</div>
          </li>
        ),
      )}
    </ol>
  );
}
