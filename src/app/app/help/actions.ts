"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { loadAppContext } from "@/server/workspace/context";
import { closeSupportRequest, openSupportRequest, replyToSupportRequest, type SupportRpc } from "@/server/workspace/support";

export type HelpFormState = { status: "idle" } | { status: "sent"; at: number } | { status: "error"; message: string };

/**
 * The signed-in person and the service-role call, or why support can't be
 * written to here. This skips the workspace write gate on purpose: a
 * suspended workspace still reaches Farbaek (migration v23).
 */
async function supportWriter(): Promise<{ actor: string; orgId: string | null; rpc: SupportRpc } | { error: string }> {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode !== "live") return { error: "Support isn't available in the demo workspace. Sign in to write to Farbaek." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "The server isn't configured for this yet." };
  return { actor: ctx.user.id, orgId: ctx.current?.id ?? null, rpc: (fn, args) => admin.rpc(fn, args) };
}

export async function openSupportAction(_prev: HelpFormState, form: FormData): Promise<HelpFormState> {
  const w = await supportWriter();
  if ("error" in w) return { status: "error", message: w.error };
  const r = await openSupportRequest(w.rpc, w.actor, { orgId: w.orgId, topic: form.get("topic"), subject: form.get("subject"), body: form.get("body") });
  if (!r.ok) return { status: "error", message: r.message };
  redirect(`/app/help/${r.value}`);
}

export async function replySupportAction(_prev: HelpFormState, form: FormData): Promise<HelpFormState> {
  const thread = z.uuid().safeParse(form.get("threadId"));
  if (!thread.success) return { status: "error", message: "That request doesn't exist or isn't yours." };
  const w = await supportWriter();
  if ("error" in w) return { status: "error", message: w.error };
  const r = await replyToSupportRequest(w.rpc, w.actor, thread.data, form.get("body"));
  if (!r.ok) return { status: "error", message: r.message };
  refresh();
  return { status: "sent", at: Date.now() };
}

export async function closeSupportAction(form: FormData): Promise<void> {
  const thread = z.uuid().safeParse(form.get("threadId"));
  if (!thread.success) return;
  const w = await supportWriter();
  if ("error" in w) return;
  await closeSupportRequest(w.rpc, w.actor, thread.data);
  refresh();
}
