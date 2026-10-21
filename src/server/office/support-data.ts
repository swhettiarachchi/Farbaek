/**
 * Office Space reads for support (migration v23): the queue by status and
 * one request in full, read with the server key. Emails are masked here,
 * on the server, for roles that may not read them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { maskEmail } from "@/core/office/permissions";
import { SUPPORT_STATUSES, SUPPORT_TOPICS, type SupportStatus, type SupportTopic } from "@/core/support/support";

const Status = z.enum(SUPPORT_STATUSES);
const Topic = z.enum(SUPPORT_TOPICS);

const QueueRow = z.object({
  id: z.uuid(),
  subject: z.string(),
  topic: Topic,
  status: Status,
  orgId: z.uuid().nullable(),
  workspace: z.string().nullable(),
  email: z.string().nullable(),
  assignedTo: z.uuid().nullable(),
  assignedEmail: z.string().nullable(),
  waiting_since: z.string(),
  messages: z.coerce.number(),
});

export interface SupportQueueRow {
  id: string;
  subject: string;
  topic: SupportTopic;
  status: SupportStatus;
  orgId: string | null;
  workspace: string | null;
  email: string;
  assignee: "you" | string | null;
  since: string;
  messages: number;
}

export function toQueueRows(rows: z.infer<typeof QueueRow>[], viewer: { userId: string; showEmail: boolean }): SupportQueueRow[] {
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    topic: r.topic,
    status: r.status,
    orgId: r.orgId,
    workspace: r.workspace,
    email: r.email ? (viewer.showEmail ? r.email : maskEmail(r.email)) : "Deleted account",
    assignee: r.assignedTo === null ? null : r.assignedTo === viewer.userId ? "you" : (r.assignedEmail ?? "A former staff member"),
    since: r.waiting_since,
    messages: r.messages,
  }));
}

export async function loadSupportQueue(admin: SupabaseClient, status: SupportStatus, abuseOnly: boolean, viewer: { userId: string; showEmail: boolean }): Promise<SupportQueueRow[]> {
  const { data, error } = await admin.rpc("app_office_support_queue", { p_status: status, p_abuse_only: abuseOnly });
  if (error) throw new Error(`Office Space couldn't read the support queue: ${error.message}`);
  return toQueueRows(z.array(QueueRow).parse(data), viewer);
}

/** How many requests wait on Farbaek, for the nav badge. Zero if it can't be read. */
export async function supportWaitingCount(admin: SupabaseClient): Promise<number> {
  const { count, error } = await admin.from("support_threads").select("id", { count: "exact", head: true }).eq("status", "waiting_on_farbaek");
  return error ? 0 : (count ?? 0);
}

const Thread = z.object({
  id: z.uuid(),
  subject: z.string(),
  topic: Topic,
  status: Status,
  orgId: z.uuid().nullable(),
  authorId: z.uuid(),
  email: z.string().nullable(),
  assignedTo: z.uuid().nullable(),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
  messages: z.array(z.object({ id: z.coerce.number(), fromStaff: z.boolean(), internal: z.boolean(), body: z.string(), createdAt: z.string(), staffEmail: z.string().nullable() })),
});

export type SupportThreadFull = Omit<z.infer<typeof Thread>, "email"> & { email: string };

export async function loadSupportThread(admin: SupabaseClient, id: string, showEmail: boolean): Promise<SupportThreadFull | null> {
  const { data, error } = await admin.rpc("app_office_support_thread", { p_id: id });
  if (error) throw new Error(`Office Space couldn't read the request: ${error.message}`);
  if (data === null) return null;
  const t = Thread.parse(data);
  return { ...t, email: t.email ? (showEmail ? t.email : maskEmail(t.email)) : "Deleted account" };
}
