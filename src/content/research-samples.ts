import { SAMPLE_CHATS, SAMPLE_CONVERSATIONS } from "@/content/chat-samples";
import { researchItems, type ResearchAnswer, type ResearchItem } from "@/core/research/library";

/**
 * The demo's research (stage 288, ADR 0296): made from the sample chats by the same rules as a real person's, so the
 * demo's Research page shows what a row looks like. It is labelled a sample where it is shown.
 */
export function sampleResearch(): ResearchItem[] {
  const answers: ResearchAnswer[] = [];
  const questions = new Map<string, string>();
  for (const chat of SAMPLE_CHATS) {
    for (const message of SAMPLE_CONVERSATIONS[chat.id] ?? []) {
      if (message.role === "user") questions.set(message.id, message.content);
      else answers.push({ id: message.id, conversationId: chat.id, parentId: message.parentId, createdAt: message.createdAt, meta: message.meta, conversation: { title: chat.title, projectId: chat.projectId ?? null, archived: false } });
    }
  }
  return researchItems(answers, questions);
}
