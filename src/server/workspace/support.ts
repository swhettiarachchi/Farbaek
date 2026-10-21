/**
 * Support requests for the signed-in person (migration v23). Reads use the
 * person's own client, so RLS shows only their requests and never internal
 * notes or who on the staff answered. Writes go through the service-role
 * app_support_* functions with the verified user id, and deliberately don't
 * use the workspace write gate: a suspended workspace must still reach us.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { hasUnreadReply, newRequestInput, supportBody, type SupportStatus, type SupportTopic } from "@/core/support/support";

export interface SupportRequestView {
  id: string;
  orgId: string | null;
  topic: SupportTopic;
  subject: string;
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
  unread: boolean;
}

export interface SupportMessageView {
  id: number;
  fromStaff: boolean;
  body: string;
  createdAt: string;
}

const THREAD_COLUMNS = "id, org_id, topic, subject, status, created_at, updated_at, last_staff_at, customer_seen_at";
const ThreadRow = z.object({
  id: z.string(),
  org_id: z.string().nullable(),
  topic: z.enum(["not_working", "billing", "account", "abuse", "other"]),
  subject: z.string(),
  status: z.enum(["waiting_on_farbaek", "waiting_on_you", "closed"]),
  created_at: z.string(),
  updated_at: z.string(),
  last_staff_at: z.string().nullable(),
  customer_seen_at: z.string().nullable(),
});
const MessageRow = z.object({ id: z.coerce.number(), from_staff: z.boolean(), body: z.string(), created_at: z.string() });

const toView = (r: z.infer<typeof ThreadRow>): SupportRequestView => ({
  id: r.id,
  orgId: r.org_id,
  topic: r.topic,
  subject: r.subject,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  unread: hasUnreadReply({ lastStaffAt: r.last_staff_at, customerSeenAt: r.customer_seen_at }),
});

export async function listMyRequests(client: SupabaseClient): Promise<SupportRequestView[]> {
  const { data, error } = await client.from("support_threads").select(THREAD_COLUMNS).order("updated_at", { ascending: false }).limit(100);
  if (error) throw new Error(`Couldn't read your support requests: ${error.message}`);
  return z.array(ThreadRow).parse(data).map(toView);
}

export async function loadMyRequest(client: SupabaseClient, id: string): Promise<{ request: SupportRequestView; messages: SupportMessageView[] } | null> {
  const [thread, messages] = await Promise.all([
    client.from("support_threads").select(THREAD_COLUMNS).eq("id", id).maybeSingle(),
    client.from("support_messages").select("id, from_staff, body, created_at").eq("thread_id", id).order("id").limit(500),
  ]);
  if (thread.error) throw new Error(`Couldn't read the support request: ${thread.error.message}`);
  if (!thread.data) return null;
  if (messages.error) throw new Error(`Couldn't read the support request: ${messages.error.message}`);
  return {
    request: toView(ThreadRow.parse(thread.data)),
    messages: z.array(MessageRow).parse(messages.data).map((m) => ({ id: m.id, fromStaff: m.from_staff, body: m.body, createdAt: m.created_at })),
  };
}

/** Requests with a reply the person hasn't opened yet, for the Help badge. */
export async function unreadSupportCount(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.from("support_threads").select("last_staff_at, customer_seen_at").not("last_staff_at", "is", null).limit(100);
  if (error) return 0;
  return z
    .array(z.object({ last_staff_at: z.string().nullable(), customer_seen_at: z.string().nullable() }))
    .parse(data)
    .filter((r) => hasUnreadReply({ lastStaffAt: r.last_staff_at, customerSeenAt: r.customer_seen_at })).length;
}

export const SUPPORT_ERROR_CODES = ["INVALID_TOPIC", "INVALID_SUBJECT", "INVALID_BODY", "SUPPORT_LIMIT", "THREAD_MISSING", "FORBIDDEN", "UNKNOWN"] as const;
export type SupportErrorCode = (typeof SUPPORT_ERROR_CODES)[number];

export const SUPPORT_MESSAGES: Record<SupportErrorCode, string> = {
  INVALID_TOPIC: "Choose what this is about.",
  INVALID_SUBJECT: "Give it a short subject, 3 to 120 characters.",
  INVALID_BODY: "Write a message of up to 4,000 characters.",
  SUPPORT_LIMIT: "You've sent a lot in a short time. Add to an open request, or try again later.",
  THREAD_MISSING: "That request doesn't exist or isn't yours.",
  FORBIDDEN: "That workspace isn't one of yours.",
  UNKNOWN: "Something went wrong and nothing was sent. Try again in a moment.",
};

export type SupportResult<T> = { ok: true; value: T } | { ok: false; code: SupportErrorCode; message: string };
const fail = <T>(code: SupportErrorCode): SupportResult<T> => ({ ok: false, code, message: SUPPORT_MESSAGES[code] });

/** The one call the writes need, so tests can stand in for the database. */
export type SupportRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

function codeFrom(message: string): SupportErrorCode {
  if (message.includes("SUPPORT_LIMIT")) return "SUPPORT_LIMIT";
  if (message.includes("THREAD_MISSING")) return "THREAD_MISSING";
  if (message.includes("FORBIDDEN")) return "FORBIDDEN";
  if (message.includes("INVALID_SUPPORT")) return "INVALID_BODY";
  return "UNKNOWN";
}

export async function openSupportRequest(rpc: SupportRpc, actor: string, input: { orgId: string | null; topic: unknown; subject: unknown; body: unknown }): Promise<SupportResult<string>> {
  const checked = newRequestInput(input);
  if (!checked.ok) return fail(checked.error === "TOPIC" ? "INVALID_TOPIC" : checked.error === "SUBJECT" ? "INVALID_SUBJECT" : "INVALID_BODY");
  const { data, error } = await rpc("app_support_open", { p_actor: actor, p_org: input.orgId, p_topic: checked.topic, p_subject: checked.subject, p_body: checked.body });
  if (error) return fail(codeFrom(error.message));
  const id = z.string().safeParse(data);
  return id.success ? { ok: true, value: id.data } : fail("UNKNOWN");
}

export async function replyToSupportRequest(rpc: SupportRpc, actor: string, threadId: string, rawBody: unknown): Promise<SupportResult<null>> {
  const body = supportBody(rawBody);
  if (!body) return fail("INVALID_BODY");
  const { error } = await rpc("app_support_reply", { p_actor: actor, p_thread: threadId, p_body: body });
  return error ? fail(codeFrom(error.message)) : { ok: true, value: null };
}

export async function closeSupportRequest(rpc: SupportRpc, actor: string, threadId: string): Promise<SupportResult<null>> {
  const { error } = await rpc("app_support_close", { p_actor: actor, p_thread: threadId });
  return error ? fail(codeFrom(error.message)) : { ok: true, value: null };
}

export async function markSupportSeen(rpc: SupportRpc, actor: string, threadId: string): Promise<void> {
  await rpc("app_support_mark_seen", { p_actor: actor, p_thread: threadId });
}
