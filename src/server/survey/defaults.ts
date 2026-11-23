import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { defaultsFrom, type EarlierPlan, type StartingDefaults } from "@/core/survey/autosurvey/defaults";
import { parseSurveyDocument } from "@/core/survey/document";

/** How many of a surveyor's recent plans are looked through for their defaults. */
const RECENT = 5;

/**
 * A new plan's defaults (stage 226, ADR 0237), from this surveyor's own recent plans in this workspace: projects they created (not
 * a colleague's whose grid they confirmed), newest first, each at its latest version. Read through row-level security with the person's own
 * client, so nothing outside what they can already open is used. A read that fails gives no defaults, never an error.
 */
export async function loadStartingDefaults(client: SupabaseClient, orgId: string, userId: string): Promise<StartingDefaults> {
  try {
    const { data: projects } = await client
      .from("survey_projects")
      .select("id, name")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .eq("created_by", z.string().uuid().parse(userId))
      .order("updated_at", { ascending: false })
      .limit(RECENT);
    const rows = z.array(z.object({ id: z.string().uuid(), name: z.string() })).safeParse(projects);
    if (!rows.success || rows.data.length === 0) return defaultsFrom([]);
    const plans: EarlierPlan[] = [];
    for (const p of rows.data) {
      const { data } = await client.from("survey_drawings").select("document").eq("project_id", p.id).order("version", { ascending: false }).limit(1).maybeSingle();
      const doc = data ? parseSurveyDocument((data as { document: unknown }).document) : null;
      if (doc) plans.push({ name: p.name, document: doc });
    }
    return defaultsFrom(plans);
  } catch {
    return defaultsFrom([]);
  }
}
