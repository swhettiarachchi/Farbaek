import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * The sketch photos kept with a plan (stage 230, ADR 0240), read as the person through row-level security: only a workspace they're
 * in. A read that fails (the v103 migration not yet applied) gives no photos, never an error.
 */

export interface SketchPhoto {
  id: string;
  position: number;
  fileName: string;
}

const uuid = z.string().uuid();
const row = z.object({ id: z.string().uuid(), position: z.number().int(), file_name: z.string() });

/** The photos of one reading (by the sketch record's readAt), in the order they were sent. */
export async function loadSketchPhotos(client: SupabaseClient, projectId: string, readAt: string): Promise<SketchPhoto[]> {
  if (!uuid.safeParse(projectId).success || !readAt) return [];
  try {
    const { data, error } = await client.from("survey_sketch_photos").select("id, position, file_name").eq("project_id", projectId).eq("read_at", readAt).order("position");
    if (error || !Array.isArray(data)) return [];
    return data.flatMap((d) => {
      const r = row.safeParse(d);
      return r.success ? [{ id: r.data.id, position: r.data.position, fileName: r.data.file_name }] : [];
    });
  } catch {
    return [];
  }
}

/** One photo's bytes, of one project. */
export async function readSketchPhoto(client: SupabaseClient, projectId: string, id: string): Promise<{ mime: string; content: string } | null> {
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(id).success) return null;
  try {
    const { data, error } = await client.from("survey_sketch_photos").select("mime, content").eq("project_id", projectId).eq("id", id).maybeSingle();
    if (error || !data || typeof data.content !== "string" || typeof data.mime !== "string") return null;
    return { mime: data.mime, content: data.content };
  } catch {
    return null;
  }
}
