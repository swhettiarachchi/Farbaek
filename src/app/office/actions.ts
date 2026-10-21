"use server";

import { redirect } from "next/navigation";
import { getStaff, officeClients, staffAction } from "@/server/office/access";
import { requestMeta } from "@/server/office/request-meta";
import { searchOffice, searchQuery, type OfficeSearchHit } from "@/server/office/search";

/** Ends this office session in the database and in Supabase, then clears the cookie. */
export async function signOutOfficeAction(): Promise<void> {
  const r = await getStaff();
  if (r.ok) await r.ctx.store.endSession({ userId: r.ctx.user.id, sessionId: r.ctx.sessionId }, await requestMeta());
  const clients = await officeClients();
  if (clients) await clients.client.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/sign-in");
}

/** Counts as activity, so an idle session gets more time. */
export async function stayActiveAction(): Promise<{ lastSeenAt: string } | null> {
  const r = await getStaff();
  return r.ok ? { lastSeenAt: r.ctx.lastSeenAt.toISOString() } : null;
}

/** Quick search for the palette. Any staff role may search; emails come back masked unless the role may read them. */
export async function searchOfficeAction(raw: string): Promise<{ ok: true; hits: OfficeSearchHit[] } | { ok: false; message: string }> {
  const gate = await staffAction("console.read");
  if (!gate.ok) return { ok: false, message: gate.message };
  const query = searchQuery(raw);
  if (!query) return { ok: true, hits: [] };
  try {
    return { ok: true, hits: await searchOffice(gate.ctx.admin, query, gate.ctx.can("people.read_email")) };
  } catch {
    return { ok: false, message: "Search isn't answering right now. The pages still work." };
  }
}
