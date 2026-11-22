import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ConversationView } from "@/components/chat/conversation-view";
import { CHAT_LIMITS } from "@/core/chat/protocol";
import { SAMPLE_CHATS, SAMPLE_CONVERSATIONS } from "@/content/chat-samples";
import { isShared, readConversation, readPath } from "@/server/chat/store";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";

/** One conversation (stage 199): the branch showing, its newest messages first read, the rest a page at a time as the person scrolls up. */
export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.current) redirect("/app");

  if (ctx.mode === "demo") {
    const sample = SAMPLE_CHATS.find((c) => c.id === id);
    const messages = SAMPLE_CONVERSATIONS[id];
    if (!sample || !messages) notFound();
    return <ConversationView key={id} conversation={{ id, title: sample.title, pinned: false, shared: false }} initialMessages={messages} initialHasEarlier={false} />;
  }

  const client = await createSupabaseServerClient();
  if (!client) notFound();
  const conversation = await readConversation(client, ctx.current.id, id);
  if (!conversation) notFound();
  const [messages, shared] = await Promise.all([readPath(client, id, null, CHAT_LIMITS.page), isShared(client, id)]);
  const list = messages ?? [];
  return (
    <ConversationView
      key={id}
      conversation={{ id, title: conversation.title, pinned: conversation.pinned, shared }}
      initialMessages={list}
      initialHasEarlier={list.length >= CHAT_LIMITS.page && list[0]?.parentId !== null}
      projectId={conversation.projectId}
    />
  );
}
