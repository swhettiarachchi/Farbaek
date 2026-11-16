import { z } from "zod";
import { ConversationView } from "@/components/chat/conversation-view";

/** A new chat (stage 199): the welcome screen and the message box. ?project= starts it in one of the workspace's projects. */
export default async function NewChatPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const projectId = project && z.uuid().safeParse(project).success ? project : null;
  return <ConversationView conversation={null} initialMessages={[]} initialHasEarlier={false} projectId={projectId} />;
}
