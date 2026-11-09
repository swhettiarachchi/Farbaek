import { BrandLogo } from "@/components/brand/brand-logo";
import { LocalTime } from "@/components/ui/local-time";
import { StatusBadge, type Status } from "@/components/ui/status-badge";
import { CUSTOMER_STATUS_WORDS, type SupportStatus } from "@/core/support/support";
import type { SupportMessageView } from "@/server/workspace/support";

/** Waiting on Farbaek is someone else's turn, waiting on you is yours, and closed is done (ADR 0183). */
const STATUS_KIND: Record<SupportStatus, Status> = {
  waiting_on_farbaek: "pending",
  waiting_on_you: "approval",
  closed: "done",
};

/** A request's state: its words, icon, colour and border together, never colour alone. */
export function SupportStatusChip({ status }: { status: SupportStatus }) {
  return <StatusBadge status={STATUS_KIND[status]} label={CUSTOMER_STATUS_WORDS[status]} />;
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
            <div className="whitespace-pre-wrap break-words rounded-md rounded-tl-sm border border-line bg-surface px-4 py-3 text-body leading-relaxed text-ink shadow-e1">{m.body}</div>
          </li>
        ) : (
          <li key={m.id} className="grid max-w-[min(100%,620px)] gap-2 justify-self-end">
            <p className="flex items-center justify-end gap-2 text-xs text-ink-3">
              <span className="font-medium text-ink-2">You</span>
              <span aria-hidden>·</span>
              <LocalTime iso={m.createdAt} />
            </p>
            <div className="whitespace-pre-wrap break-words rounded-md rounded-tr-sm border border-accent/15 bg-accent/[0.05] px-4 py-3 text-body leading-relaxed text-ink">{m.body}</div>
          </li>
        ),
      )}
    </ol>
  );
}
