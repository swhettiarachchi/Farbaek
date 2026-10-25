"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { deviceLabel } from "@/core/office/devices";
import { pushToPerson } from "@/server/push/notifier";
import { allowedEndpoint } from "@/server/push/send";
import { createSupabasePushStore } from "@/server/push/store";
import { serverPushDeps } from "@/server/push/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { loadAppContext } from "@/server/workspace/context";

export type PushState = { ok: true; message: string } | { ok: false; message: string };

const Subscription = z.object({
  endpoint: z.string().max(1000),
  p256dh: z.string().regex(/^B[A-Za-z0-9_-]{85,86}$/),
  auth: z.string().regex(/^[A-Za-z0-9_-]{21,22}$/),
});

async function person(): Promise<{ userId: string } | { error: string }> {
  const ctx = await loadAppContext();
  if (!ctx) return { error: "Sign in again to change notifications." };
  if (ctx.mode !== "live") return { error: "Notifications are for real accounts, not the demo workspace." };
  return { userId: ctx.user.id };
}

/** Keeps this device's push subscription for the signed-in person (ADR 0079). */
export async function savePushAction(input: { endpoint: string; p256dh: string; auth: string }): Promise<PushState> {
  const parsed = Subscription.safeParse(input);
  if (!parsed.success || !allowedEndpoint(parsed.data.endpoint)) return { ok: false, message: "This browser's notification service isn't one Farbaek can send to." };
  const p = await person();
  if ("error" in p) return { ok: false, message: p.error };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "Notifications aren't set up on this server yet." };
  const label = deviceLabel((await headers()).get("user-agent"));
  const saved = await createSupabasePushStore(admin).save({ userId: p.userId, ...parsed.data, label });
  if (!saved) return { ok: false, message: "This device couldn't be saved. Try again." };
  revalidatePath("/app/settings");
  return { ok: true, message: `Notifications are on for ${label}.` };
}

export async function removePushAction(endpoint: string): Promise<PushState> {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return { ok: false, message: "That device couldn't be found." };
  const p = await person();
  if ("error" in p) return { ok: false, message: p.error };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "Notifications aren't set up on this server yet." };
  const removed = await createSupabasePushStore(admin).remove({ userId: p.userId, endpoint });
  revalidatePath("/app/settings");
  return removed ? { ok: true, message: "Notifications are off for that device." } : { ok: false, message: "That device couldn't be removed. Try again." };
}

/** A test notification to every device the person turned notifications on for. */
export async function testPushAction(): Promise<PushState> {
  const p = await person();
  if ("error" in p) return { ok: false, message: p.error };
  const deps = serverPushDeps();
  const admin = createSupabaseAdminClient();
  if (!deps || !admin) return { ok: false, message: "Notifications aren't set up on this server yet." };
  const limit = await admin.rpc("app_rate_limit", { p_key: `push-test:${p.userId}`, p_window_seconds: 3600, p_limit: 10 });
  if (limit.error || limit.data !== true) return { ok: false, message: "That's enough tests for now. Try again in an hour." };
  const sent = await pushToPerson(deps, p.userId, {
    title: "Farbaek notifications are on",
    body: "This is a test from Settings. You'll hear here when a build you started finishes, or a change's checks end.",
    url: "/app/settings#device",
    tag: "test",
  });
  return sent > 0 ? { ok: true, message: `Sent to ${sent} ${sent === 1 ? "device" : "devices"}. It can take a few seconds to arrive.` } : { ok: false, message: "No device took it. Turn notifications on here again." };
}
