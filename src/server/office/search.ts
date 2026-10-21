/**
 * Office Space quick search (migration v22): workspaces by name or id prefix,
 * people by email, sites by name, read in one call with the server key.
 * Emails are masked here, on the server, for roles that may not read them,
 * so a full address never reaches their browser.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { maskEmail } from "@/core/office/permissions";

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_CHARS = 100;

export interface OfficeSearchHit {
  id: string;
  kind: "workspace" | "person" | "site";
  label: string;
  hint: string;
  href: string;
}

const Found = z.object({
  workspaces: z.array(z.object({ id: z.uuid(), name: z.string(), suspended: z.boolean() })),
  people: z.array(z.object({ id: z.uuid(), email: z.string(), orgId: z.uuid().nullable() })),
  sites: z.array(z.object({ id: z.uuid(), name: z.string(), orgId: z.uuid(), workspace: z.string(), live: z.boolean(), blocked: z.boolean() })),
});

/** The query as searched, or null when it's too short or too long to search. */
export function searchQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const q = raw.trim().replace(/\s+/g, " ");
  return q.length >= SEARCH_MIN_CHARS && q.length <= SEARCH_MAX_CHARS ? q : null;
}

/** Results as rows the palette can show and open. Hrefs are the visible office paths. */
export function toHits(found: z.infer<typeof Found>, showEmail: boolean): OfficeSearchHit[] {
  return [
    ...found.workspaces.map((w) => ({ id: `w:${w.id}`, kind: "workspace" as const, label: w.name, hint: w.suspended ? "Suspended" : "Workspace", href: `/workspaces/${w.id}` })),
    ...found.people.map((p) => ({
      id: `p:${p.id}`,
      kind: "person" as const,
      label: showEmail ? p.email : maskEmail(p.email),
      hint: p.orgId ? "Person, opens their workspace" : "Person, no workspace yet",
      href: p.orgId ? `/workspaces/${p.orgId}` : "/people",
    })),
    ...found.sites.map((s) => ({
      id: `s:${s.id}`,
      kind: "site" as const,
      label: s.name,
      hint: `${s.blocked ? "Taken offline" : s.live ? "Live" : "Offline"} · ${s.workspace}`,
      href: `/workspaces/${s.orgId}`,
    })),
  ];
}

export async function searchOffice(admin: SupabaseClient, query: string, showEmail: boolean): Promise<OfficeSearchHit[]> {
  const { data, error } = await admin.rpc("app_office_search", { p_query: query });
  if (error) throw new Error(`Office Space couldn't search: ${error.message}`);
  return toHits(Found.parse(data), showEmail);
}
