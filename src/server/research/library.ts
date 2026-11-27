import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { latestByConversation, researchItems, type ResearchAnswer, type ResearchItem } from "@/core/research/library";

/** Answers read before they are made into the list: more than it shows, since some are tries of one question. */
const ANSWERS_READ = 160;
/** Answers read from the conversations Farbaek adds to by itself: enough to find the newest in each. */
const REPEATED_READ = 120;
const SCHEDULED_READ = 400;
/** As much of a question as a title can use. Only the listed rows' questions are read. */
const QUESTION_CHARS = 400;

const ANSWER_COLUMNS = "id, conversation_id, parent_id, created_at, meta";
type AnswerRow = { id: string; conversation_id: string; parent_id: string | null; created_at: string; meta: unknown };

export interface ResearchLists {
  /** What the person asked for themselves. */
  asked: ResearchItem[];
  /** What Farbaek repeats by itself, one row for each scheduled task's or agent's conversation. */
  repeated: ResearchItem[];
}

const NO_QUESTIONS: ReadonlyMap<string, string> = new Map();

/**
 * The research this person has done in this workspace (stage 288, ADR 0296). Read as the signed-in person, so the
 * database's row rules decide what is theirs: nobody's research is listed for anyone else. Plain reads, no joins. Null
 * when it couldn't be read, so the page can say so instead of saying there is none.
 *
 * A scheduled task's runs all land in the task's own conversation and all ask the same thing, so those conversations are
 * read apart and listed once each: otherwise an hourly task would push everything the person asked for off the list.
 */
export async function listResearch(client: SupabaseClient, orgId: string): Promise<ResearchLists | null> {
  const scheduled = await client.from("scheduled_tasks").select("conversation_id").eq("org_id", orgId).not("conversation_id", "is", null).limit(SCHEDULED_READ);
  // A list of tasks that can't be read costs only the grouping: their runs are then listed with the rest.
  const repeating = scheduled.error ? [] : [...new Set(((scheduled.data ?? []) as { conversation_id: string | null }[]).map((r) => r.conversation_id).filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))];

  const answers = () =>
    client
      .from("chat_messages")
      .select(ANSWER_COLUMNS)
      .eq("org_id", orgId)
      .eq("role", "assistant")
      // A stopped answer keeps what it read too.
      .in("status", ["complete", "stopped"])
      // Only answers whose record says a search was done.
      .contains("meta", { search: { status: "done" } })
      .order("created_at", { ascending: false });
  const [own, theirs] = await Promise.all([
    repeating.length > 0 ? answers().not("conversation_id", "in", `(${repeating.join(",")})`).limit(ANSWERS_READ) : answers().limit(ANSWERS_READ),
    repeating.length > 0 ? answers().in("conversation_id", repeating).limit(REPEATED_READ) : Promise.resolve({ data: [] as AnswerRow[], error: null }),
  ]);
  if (own.error || !own.data) return null;
  const ownRows = own.data as AnswerRow[];
  const repeatedRows = theirs.error ? [] : ((theirs.data ?? []) as AnswerRow[]);
  if (ownRows.length === 0 && repeatedRows.length === 0) return { asked: [], repeated: [] };

  const conversationIds = [...new Set([...ownRows, ...repeatedRows].map((r) => r.conversation_id))];
  const conversations = await client.from("chat_conversations").select("id, title, project_id, archived_at").in("id", conversationIds);
  if (conversations.error || !conversations.data) return null;
  const byId = new Map((conversations.data as { id: string; title: string; project_id: string | null; archived_at: string | null }[]).map((c) => [c.id, c]));
  const toAnswers = (rows: AnswerRow[]): ResearchAnswer[] =>
    rows.map((r) => {
      const c = byId.get(r.conversation_id);
      return { id: r.id, conversationId: r.conversation_id, parentId: r.parent_id, createdAt: r.created_at, meta: r.meta, conversation: c ? { title: c.title, projectId: c.project_id, archived: c.archived_at !== null } : null };
    });
  const asked = toAnswers(ownRows);
  const repeated = toAnswers(repeatedRows);

  // Which rows are listed is decided first, so only their questions are read: a question can be a pasted document.
  const parentOf = new Map([...asked, ...repeated].map((a) => [a.id, a.parentId]));
  const listed = [...researchItems(asked, NO_QUESTIONS), ...latestByConversation(repeated, NO_QUESTIONS)];
  const questionIds = [...new Set(listed.map((item) => parentOf.get(item.id)).filter((id): id is string => typeof id === "string"))];
  const read = questionIds.length > 0 ? await client.from("chat_messages").select("id, content").in("id", questionIds) : { data: [] as { id: string; content: string }[], error: null };
  // A question that couldn't be read only costs its title: the chat's own name stands in.
  const questions = new Map(((read.error ? [] : (read.data ?? [])) as { id: string; content: string }[]).map((q) => [q.id, typeof q.content === "string" ? q.content.slice(0, QUESTION_CHARS) : ""]));

  return { asked: researchItems(asked, questions), repeated: latestByConversation(repeated, questions) };
}
