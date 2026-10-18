import { SECURITY_CHECK_MAX_MINUTES } from "./runner";
import { createSupabaseSecurityStore, listSecurityReports, type SecurityReportView } from "./store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * A project's security reports for the Security page, read as the person.
 * A check that outlived its time limit stopped with its server: it's marked
 * failed here, so the page never waits on it forever.
 */
export async function loadProjectReports(orgId: string, projectId: string): Promise<SecurityReportView[]> {
  const user = await createSupabaseServerClient();
  if (!user) return [];
  const reports = await listSecurityReports(user, orgId, projectId).catch(() => [] as SecurityReportView[]);
  const cutoff = new Date(Date.now() - SECURITY_CHECK_MAX_MINUTES * 60_000);
  const stale = reports.some((r) => r.status === "running" && Date.parse(r.startedAt) < cutoff.getTime());
  const admin = createSupabaseAdminClient();
  if (stale && admin && (await createSupabaseSecurityStore(admin).interruptStale(cutoff)) > 0) {
    return listSecurityReports(user, orgId, projectId).catch(() => reports);
  }
  return reports;
}
