import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readOfficeProfile, type OfficeProfile } from "@/core/survey/profile";

const uuid = z.string().uuid();

/**
 * A workspace's office profiles (stage 248, ADR 0256), read as the signed-in person through row-level security, newest saved first.
 * A row whose body doesn't fit the schema is left out. A read that fails gives none, never an error: Generate Plan then starts from the
 * surveyor's recent plans, as before.
 */
export async function loadOfficeProfiles(client: SupabaseClient, orgId: string): Promise<OfficeProfile[]> {
  if (!uuid.safeParse(orgId).success) return [];
  try {
    const { data, error } = await client.from("survey_office_profiles").select("id, name, version, body, updated_at").eq("org_id", orgId).is("archived_at", null).order("updated_at", { ascending: false }).limit(50);
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => readOfficeProfile(r as Parameters<typeof readOfficeProfile>[0])).filter((p): p is OfficeProfile => p !== null);
  } catch {
    return [];
  }
}

/** The profile this surveyor generated a plan with last, or null. */
export async function loadProfileChoice(client: SupabaseClient, orgId: string, userId: string): Promise<string | null> {
  if (!uuid.safeParse(orgId).success || !uuid.safeParse(userId).success) return null;
  try {
    const { data } = await client.from("survey_office_profile_choices").select("profile_id").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
    const id = (data as { profile_id?: unknown } | null)?.profile_id;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

export interface ProfileVersion {
  version: number;
  name: string;
  savedAt: string;
}

/** A profile's saved versions, newest first: every one is kept, so what a plan started from can be read again. */
export async function loadProfileVersions(client: SupabaseClient, profileId: string): Promise<ProfileVersion[]> {
  if (!uuid.safeParse(profileId).success) return [];
  try {
    const { data } = await client.from("survey_office_profile_versions").select("version, name, saved_at").eq("profile_id", profileId).order("version", { ascending: false }).limit(30);
    const rows = z.array(z.object({ version: z.number().int(), name: z.string(), saved_at: z.string() })).safeParse(data);
    return rows.success ? rows.data.map((r) => ({ version: r.version, name: r.name, savedAt: r.saved_at })) : [];
  } catch {
    return [];
  }
}
