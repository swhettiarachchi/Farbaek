import { LockSimpleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { AnswerMessage, UserMessage } from "@/components/chat/message";
import { buttonClasses } from "@/components/ui/button";
import { FOCUSED_TITLE } from "@/components/ui/titles";
import { modelName } from "@/core/billing/model-names";
import type { ChatMessage } from "@/core/chat/protocol";
import { openSharedChat, type SharedChatState } from "@/server/chat/share";
import "@/styles/chat-theme.css";

export const metadata: Metadata = { title: "Shared chat" };

const CLOSED: Record<SharedChatState, { title: string; detail: string }> = {
  none: { title: "This link doesn't work", detail: "Check that you copied all of it, or ask the person who sent it for a new one." },
  revoked: { title: "This link was turned off", detail: "Ask the person who sent it for a new one." },
  expired: { title: "This link has expired", detail: "Ask the person who sent it for a new one." },
  paused: { title: "Links are paused for a short while", detail: "Farbaek has paused shared links for everyone. Try again soon." },
  suspended: { title: "This chat isn't available right now", detail: "Ask the person who sent the link." },
  sign_in: { title: "Sign in to open this chat", detail: "It's shared with the people in its workspace. Sign in with the account you use there." },
  members_only: { title: "This chat is shared with its workspace only", detail: "You're signed in, but not as someone in that workspace. Ask the person who sent it to share it with anyone who has the link." },
  limited: { title: "Too many opens from here for now", detail: "Shared links can be opened a few hundred times an hour from one place. Try again later." },
  unavailable: { title: "This chat can't be shown right now", detail: "Try again in a minute." },
};

/** A chat shared by link (stage 199, ADR 0213): read-only, as it was when it was shared, with nothing of the app around it. */
export default async function SharedChatPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const opened = await openSharedChat(token);
  if (!opened.ok) {
    const c = CLOSED[opened.state];
    return (
      <div className="mx-auto max-w-lg py-10">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-surface-raised text-ink-2">
          <LockSimpleIcon size={24} weight="bold" aria-hidden />
        </span>
        <h1 className={`mt-5 ${FOCUSED_TITLE}`}>{c.title}</h1>
        <p className="mt-3 text-body leading-relaxed text-ink-2">{c.detail}</p>
        {opened.state === "sign_in" ? (
          <Link href={`/sign-in?next=${encodeURIComponent(`/share/chat/${token}`)}`} className={buttonClasses("primary", "md", "mt-6")}>
            Sign in
          </Link>
        ) : null}
      </div>
    );
  }
  const chat = opened.chat;
  const base = `/share/chat/${token}/file`;
  const messages: ChatMessage[] = chat.messages.map((m) => ({
    id: m.id,
    parentId: null,
    role: m.role,
    kind: m.kind,
    content: m.content,
    status: m.status === "streaming" ? "stopped" : (m.status as ChatMessage["status"]),
    modelName: m.model ? modelName(m.model) : null,
    error: null,
    rating: null,
    thinkingMs: null,
    // The sources an answer cites go with it (stage 207), so its citations are links here too.
    meta: m.search ? { search: m.search } : {},
    createdAt: m.createdAt,
    siblings: [m.id],
    files: m.files,
  }));
  return (
    <div className="chat-root mx-auto max-w-3xl">
      <h1 className={FOCUSED_TITLE}>{chat.title}</h1>
      <p className="mt-2 text-sm text-ink-3">A chat with Farbaek&apos;s AI, shared read-only as it was when shared. {chat.audience === "workspace" ? "Only people in its workspace can open this link." : "Anyone with the link can open it."}</p>
      <div className="mt-8 grid gap-8">
        {messages.map((m) => (m.role === "user" ? <UserMessage key={m.id} message={m} readOnly fileBase={base} /> : <AnswerMessage key={m.id} message={m} readOnly fileBase={base} />))}
      </div>
      <div className="mt-12 rounded-lg border border-line bg-surface p-5 shadow-e1 sm:p-6">
        <p className="text-base font-medium text-ink">Chat with Farbaek</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">Ask, write, code and create images in your own private workspace.</p>
        <Link href="/app/chat" className={buttonClasses("primary", "sm", "mt-4")}>
          Start a chat
        </Link>
      </div>
    </div>
  );
}
