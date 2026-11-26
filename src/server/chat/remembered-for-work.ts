import "server-only";
import { cookies } from "next/headers";
import { MEMORY_COOKIE, memoryForBrief, memoryOnFromCookie } from "@/core/chat/memory";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { readMemories } from "./store";

/**
 * What the signed-in person asked Farbaek to remember, for work outside Chat (stage 284, ADR 0292): the plan Build drafts for
 * them. Read as them, so it is only ever their own. Nothing when they switched memory off in this browser, and nothing when it
 * couldn't be read: work never waits on it or fails for it.
 */
export async function rememberedForWork(orgId: string): Promise<string[]> {
  try {
    const jar = await cookies();
    if (!memoryOnFromCookie(jar.get(MEMORY_COOKIE)?.value)) return [];
    const client = await createSupabaseServerClient();
    if (!client) return [];
    const list = await readMemories(client, orgId);
    return memoryForBrief((list ?? []).map((m) => m.content));
  } catch {
    return [];
  }
}
