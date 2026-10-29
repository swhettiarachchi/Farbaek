"use server";

/**
 * Disconnecting a phone (ADR 0110): the app is refused from its next request,
 * its notifications stop, and its Supabase session ends.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabasePhoneStore } from "@/server/phone/store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { loadAppContext } from "@/server/workspace/context";

export type DisconnectState = { status: "idle" } | { status: "done"; message: string } | { status: "error"; message: string };

export async function disconnectPhoneAction(_previous: DisconnectState, form: FormData): Promise<DisconnectState> {
  const id = z.uuid().safeParse(form.get("deviceId"));
  if (!id.success) return { status: "error", message: "That phone isn't on your account." };
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode === "demo") return { status: "error", message: "The demo workspace has no phones to disconnect." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { status: "error", message: "The server isn't configured for this." };
  const result = await createSupabasePhoneStore(admin).revoke(ctx.user.id, id.data);
  if (result === "not_found") return { status: "error", message: "That phone isn't on your account." };
  revalidatePath("/app/settings");
  return {
    status: "done",
    message: result === "signed_out" ? "Disconnected. The app on that phone is signed out." : "Disconnected. Farbaek refuses that phone from now on; its sign-in ends when it next expires.",
  };
}
