/**
 * Support requests (migration v23, ADR 0032 phase 4): what a person can
 * write, how a request's state reads to them and to staff, and when a reply
 * is unread. The database repeats every limit here and is the authority.
 */

export const SUPPORT_TOPICS = ["not_working", "billing", "account", "abuse", "other"] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

export const TOPIC_LABELS: Record<SupportTopic, string> = {
  not_working: "Something isn't working",
  billing: "Plans and usage",
  account: "Account and sign-in",
  abuse: "Report a site or abuse",
  other: "Something else",
};

export const SUPPORT_STATUSES = ["waiting_on_farbaek", "waiting_on_you", "closed"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

/** How a status reads to the person who wrote the request. */
export const CUSTOMER_STATUS_WORDS: Record<SupportStatus, string> = {
  waiting_on_farbaek: "Waiting on Farbaek",
  waiting_on_you: "Farbaek answered",
  closed: "Closed",
};

/** How a status reads in Office Space. */
export const STAFF_STATUS_WORDS: Record<SupportStatus, string> = {
  waiting_on_farbaek: "Waiting on us",
  waiting_on_you: "Waiting on the customer",
  closed: "Closed",
};

export const SUPPORT_LIMITS = { subjectMin: 3, subjectMax: 120, bodyMax: 4000, opensPerDay: 5, messagesPerHour: 30 } as const;

export function isSupportTopic(value: unknown): value is SupportTopic {
  return typeof value === "string" && (SUPPORT_TOPICS as readonly string[]).includes(value);
}

export function isSupportStatus(value: unknown): value is SupportStatus {
  return typeof value === "string" && (SUPPORT_STATUSES as readonly string[]).includes(value);
}

export type SupportInputError = "TOPIC" | "SUBJECT" | "BODY";

/** Trims and checks a message body: 1 to 4,000 characters once trimmed. */
export function supportBody(raw: unknown): string | null {
  const body = typeof raw === "string" ? raw.trim() : "";
  return body.length >= 1 && body.length <= SUPPORT_LIMITS.bodyMax ? body : null;
}

/** A new request's fields, checked the way the database will check them. */
export function newRequestInput(input: { topic: unknown; subject: unknown; body: unknown }): { ok: true; topic: SupportTopic; subject: string; body: string } | { ok: false; error: SupportInputError } {
  if (!isSupportTopic(input.topic)) return { ok: false, error: "TOPIC" };
  const subject = typeof input.subject === "string" ? input.subject.trim().replace(/\s+/g, " ") : "";
  if (subject.length < SUPPORT_LIMITS.subjectMin || subject.length > SUPPORT_LIMITS.subjectMax) return { ok: false, error: "SUBJECT" };
  const body = supportBody(input.body);
  if (!body) return { ok: false, error: "BODY" };
  return { ok: true, topic: input.topic, subject, body };
}

/** A reply is unread when Farbaek wrote after the person last opened the request. */
export function hasUnreadReply(thread: { lastStaffAt: string | null; customerSeenAt: string | null }): boolean {
  if (!thread.lastStaffAt) return false;
  if (!thread.customerSeenAt) return true;
  return Date.parse(thread.lastStaffAt) > Date.parse(thread.customerSeenAt);
}

/** "3 hours", "2 days": how long something has waited, for queues. Never "0". */
export function waitingFor(sinceIso: string, now: Date): string {
  const minutes = Math.max(1, Math.floor((now.getTime() - Date.parse(sinceIso)) / 60_000));
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.floor(hours / 24);
  return `${days} days`;
}

/**
 * Priority support (ADR 0084): requests from workspaces whose plan includes
 * it go first in the queue waiting on Farbaek; within each group the
 * queue's own order (longest waiting first) holds.
 */
export function priorityFirst<T extends { priority: boolean }>(rows: readonly T[]): T[] {
  return [...rows.filter((r) => r.priority), ...rows.filter((r) => !r.priority)];
}
