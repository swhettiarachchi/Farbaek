/**
 * Live announcements from Office Space (ADR 0032), read with the signed-in
 * person's own client: row-level security shows only live ones, and the
 * column grants leave out who wrote them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export interface Announcement {
  id: string;
  message: string;
  tone: "info" | "incident";
  dismissible: boolean;
}

const Row = z.object({ id: z.string(), message: z.string(), tone: z.enum(["info", "incident"]), dismissible: z.boolean() });

export async function liveAnnouncements(client: SupabaseClient): Promise<Announcement[]> {
  try {
    const { data, error } = await client.from("announcements").select("id, message, tone, dismissible, starts_at").order("starts_at", { ascending: false }).limit(3);
    if (error) return [];
    return (data ?? []).flatMap((r) => {
      const p = Row.safeParse(r);
      return p.success ? [p.data] : [];
    });
  } catch {
    return [];
  }
}
