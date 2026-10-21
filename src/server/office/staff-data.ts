/**
 * Office Space reads (ADR 0032): the staff, their invites and sessions, and
 * the audit log. The server key reads these tables; nothing here writes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyStaffAuditChain, type ChainCheck, type ChainRow } from "@/core/office/audit-chain";
import { isStaffRole, type StaffRole } from "@/core/office/permissions";

function fail(what: string, message: string): never {
  throw new Error(`Office Space couldn't read ${what}: ${message}`);
}

export async function listStaffEmails(admin: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await admin.from("staff_members").select("email").is("removed_at", null);
  if (error) fail("the staff list", error.message);
  return new Set((data ?? []).map((r: { email: string }) => r.email.toLowerCase()));
}

export interface StaffMemberRow {
  userId: string;
  email: string;
  role: StaffRole;
  since: string;
  removedAt: string | null;
  resetUntil: string | null;
  openSessions: number;
  lastSeenAt: string | null;
}

export interface StaffInviteRow {
  id: string;
  email: string;
  role: StaffRole;
  expiresAt: string;
  createdAt: string;
}

export async function loadStaffPage(admin: SupabaseClient, now = new Date()) {
  const [members, invites, sessions] = await Promise.all([
    admin.from("staff_members").select("user_id, email, role, created_at, removed_at, mfa_reset_until").order("created_at"),
    admin.from("staff_invites").select("id, email, role, created_at, expires_at").is("accepted_at", null).is("revoked_at", null).gt("expires_at", now.toISOString()).order("created_at", { ascending: false }),
    admin.from("staff_sessions").select("user_id, last_seen_at").is("ended_at", null),
  ]);
  if (members.error) fail("the staff list", members.error.message);
  if (invites.error) fail("staff invites", invites.error.message);
  if (sessions.error) fail("staff sessions", sessions.error.message);

  const open = new Map<string, { count: number; last: string | null }>();
  for (const s of sessions.data ?? []) {
    const cur = open.get(s.user_id) ?? { count: 0, last: null };
    cur.count += 1;
    if (!cur.last || s.last_seen_at > cur.last) cur.last = s.last_seen_at;
    open.set(s.user_id, cur);
  }
  const people: StaffMemberRow[] = (members.data ?? [])
    .filter((m) => isStaffRole(m.role))
    .map((m) => ({
      userId: m.user_id,
      email: m.email,
      role: m.role as StaffRole,
      since: m.created_at,
      removedAt: m.removed_at,
      resetUntil: m.mfa_reset_until && new Date(m.mfa_reset_until) > now ? m.mfa_reset_until : null,
      openSessions: open.get(m.user_id)?.count ?? 0,
      lastSeenAt: open.get(m.user_id)?.last ?? null,
    }));
  const pending: StaffInviteRow[] = (invites.data ?? [])
    .filter((i) => isStaffRole(i.role))
    .map((i) => ({ id: i.id, email: i.email, role: i.role as StaffRole, createdAt: i.created_at, expiresAt: i.expires_at }));
  return { active: people.filter((p) => !p.removedAt), removed: people.filter((p) => p.removedAt), invites: pending };
}

export interface AuditEventRow {
  seq: number;
  at: string;
  actor: string | null;
  actorRole: string | null;
  strength: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  result: string;
  detail: Record<string, unknown>;
  rowHash: string;
}

const PAGE = 50;

/** The newest events, or those before `before`; only the person's own when `ownOnly`. */
export async function loadAuditPage(admin: SupabaseClient, opts: { before?: number; ownOnly?: string } = {}) {
  let query = admin
    .from("staff_audit_events")
    .select("seq, occurred_at, actor_user_id, actor_role, auth_strength, action, target_type, target_id, reason, result, detail, row_hash")
    .order("seq", { ascending: false })
    .limit(PAGE + 1);
  if (opts.before) query = query.lt("seq", opts.before);
  if (opts.ownOnly) query = query.eq("actor_user_id", opts.ownOnly);
  const [{ data, error }, emails, last] = await Promise.all([
    query,
    admin.from("staff_members").select("user_id, email"),
    admin.from("staff_audit_verifications").select("verified_at, through_seq, ok, first_bad_seq").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (error) fail("the audit log", error.message);
  const who = new Map((emails.data ?? []).map((m: { user_id: string; email: string }) => [m.user_id, m.email]));
  const rows: AuditEventRow[] = (data ?? []).slice(0, PAGE).map((r) => ({
    seq: Number(r.seq),
    at: r.occurred_at,
    actor: r.actor_user_id ? (who.get(r.actor_user_id) ?? "Not on the staff") : null,
    actorRole: r.actor_role,
    strength: r.auth_strength,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    reason: r.reason,
    result: r.result,
    detail: (r.detail ?? {}) as Record<string, unknown>,
    rowHash: r.row_hash,
  }));
  return {
    rows,
    nextBefore: (data ?? []).length > PAGE ? rows[rows.length - 1]!.seq : null,
    lastCheck: last.data ? { at: last.data.verified_at as string, throughSeq: Number(last.data.through_seq), ok: Boolean(last.data.ok), firstBadSeq: last.data.first_bad_seq === null ? null : Number(last.data.first_bad_seq) } : null,
  };
}

/** Re-checks the whole chain, 1,000 events at a time. */
export async function verifyAuditChain(admin: SupabaseClient): Promise<ChainCheck> {
  let previous: { seq: number; row_hash: string } | null = null;
  let checked = 0;
  for (;;) {
    const from = previous ? previous.seq + 1 : 1;
    const { data, error } = await admin
      .from("staff_audit_events")
      .select("seq, prev_hash, envelope, row_hash, action, result, target_type, target_id")
      .gte("seq", from)
      .order("seq")
      .limit(1000);
    if (error) fail("the audit log", error.message);
    const rows: ChainRow[] = (data ?? []).map((r) => ({ ...r, seq: Number(r.seq) }));
    if (rows.length === 0) return previous ? { ok: true, checked, throughSeq: previous.seq, headHash: previous.row_hash } : { ok: true, checked: 0, throughSeq: 0, headHash: "0".repeat(64) };
    const result = await verifyStaffAuditChain(rows, previous);
    if (!result.ok) return { ...result, checked: checked + result.checked };
    checked += result.checked;
    const lastRow = rows[rows.length - 1]!;
    previous = { seq: lastRow.seq, row_hash: lastRow.row_hash };
    if (rows.length < 1000) return { ok: true, checked, throughSeq: previous.seq, headHash: previous.row_hash };
  }
}
