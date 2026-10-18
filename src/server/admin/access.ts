/**
 * Who may open the admin console (ADR 0026). Enforced here, on the server,
 * for every admin page: hiding the link is only a convenience.
 *
 * Fails closed. Someone is an admin only when all of these hold:
 * - FARBAEK_ADMIN_EMAILS lists their email (unset or empty: nobody is);
 * - they have a valid session;
 * - their email is confirmed (sign-in is a magic link, so this proves they
 *   control the mailbox);
 * - the server key is set, since the console reads across workspaces with it.
 * Anyone else gets a 404, so the console's existence isn't revealed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

type Env = Record<string, string | undefined>;

/** The allowlist from FARBAEK_ADMIN_EMAILS: comma separated, case-insensitive. */
export function adminEmails(env: Env = process.env): Set<string> {
  return new Set(
    (env.FARBAEK_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
  );
}

export function isAdminEmail(email: string | null | undefined, env: Env = process.env): boolean {
  return Boolean(email) && adminEmails(env).has(email!.trim().toLowerCase());
}

export interface AdminCheckInput {
  /** The session's claims, or null without a session. */
  claims: { sub?: unknown; email?: unknown } | null;
  /** Looks the user up with the server key; null when the server key isn't set. */
  lookup: ((id: string) => Promise<{ email: string | null; confirmedAt: string | null } | null>) | null;
  env?: Env;
}

export type AdminCheck = { ok: true; user: { id: string; email: string } } | { ok: false; reason: "no_session" | "not_listed" | "no_server_key" | "not_confirmed" };

/** The admin check, without Next.js, so every refusal can be tested. */
export async function checkAdmin({ claims, lookup, env = process.env }: AdminCheckInput): Promise<AdminCheck> {
  const id = typeof claims?.sub === "string" ? claims.sub : null;
  const claimed = typeof claims?.email === "string" ? claims.email : null;
  if (!id) return { ok: false, reason: "no_session" };
  if (!isAdminEmail(claimed, env)) return { ok: false, reason: "not_listed" };
  if (!lookup) return { ok: false, reason: "no_server_key" };
  const user = await lookup(id).catch(() => null);
  // The stored email must still be the listed one, and confirmed.
  if (!user?.email || !isAdminEmail(user.email, env) || !user.confirmedAt) return { ok: false, reason: "not_confirmed" };
  return { ok: true, user: { id, email: user.email.toLowerCase() } };
}

export interface AdminSession {
  user: { id: string; email: string };
  /** The server-key client, handed out only after the check passes. */
  admin: SupabaseClient;
}

/** The admin's session, or null for anyone else. Once per request. */
export const getAdmin = cache(async (): Promise<AdminSession | null> => {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data } = await client.auth.getClaims();
  const admin = createSupabaseAdminClient();
  const result = await checkAdmin({
    claims: data?.claims ?? null,
    lookup: admin
      ? async (id) => {
          const { data: found, error } = await admin.auth.admin.getUserById(id);
          if (error || !found.user) return null;
          return { email: found.user.email ?? null, confirmedAt: found.user.email_confirmed_at ?? null };
        }
      : null,
  });
  return result.ok && admin ? { user: result.user, admin } : null;
});

/** For admin pages: the admin's session, or a 404. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdmin();
  if (!session) notFound();
  return session;
}

/** A console page's title, given only to an admin: anyone else sees the plain 404 title. */
export async function adminMetadata(title: string): Promise<Metadata> {
  return (await getAdmin()) ? { title: { absolute: `${title} | Farbaek admin` } } : { title: "Page not found" };
}
