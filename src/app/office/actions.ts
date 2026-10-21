"use server";

import { redirect } from "next/navigation";
import { getStaff, officeClients } from "@/server/office/access";
import { requestMeta } from "@/server/office/request-meta";

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
