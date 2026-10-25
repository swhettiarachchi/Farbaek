/**
 * Escalation on this server (ADR 0083): incidents and people read with the
 * server's key, the plan resolved from the workspace's billing, and each
 * owner and admin told by email and on their devices.
 */
import { z } from "zod";
import { checkFeature } from "@/core/billing/entitlements";
import { resolveEffectivePlan } from "@/core/billing/trial";
import { SEVERITY_WORDS } from "@/core/trust/incidents";
import { renderEmail, sendEmail } from "@/server/email/compose";
import { readEmailConfig } from "@/server/email/config";
import { isPlainAddress } from "@/server/email/message";
import { confirmedEmail } from "@/server/email/wiring";
import { log } from "@/server/observability/log";
import { pushToPerson } from "@/server/push/notifier";
import { serverPushDeps } from "@/server/push/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { ORGANIZATION_SELECT, billingSnapshotFromRow } from "@/server/workspace/organizations";
import type { EscalationDeps } from "./incident-escalation";

export function incidentEscalationDeps(): EscalationDeps | null {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const email = readEmailConfig();
  const push = serverPushDeps();
  if (!email && !push) return null;

  return {
    async due() {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data, error } = await admin
        .from("incidents")
        .select("id, org_id, number, title, severity")
        .in("severity", ["high", "critical"])
        .neq("status", "resolved")
        .is("escalated_at", null)
        .gte("opened_at", since)
        .limit(200);
      if (error) throw new Error(`Couldn't read incidents: ${error.message}`);
      return z
        .array(z.object({ id: z.string(), org_id: z.string(), number: z.number().int(), title: z.string(), severity: z.enum(["high", "critical"]) }))
        .parse(data ?? [])
        .map((r) => ({ id: r.id, orgId: r.org_id, number: r.number, title: r.title, severity: r.severity }));
    },

    async hasTools(orgId) {
      const { data, error } = await admin.from("organizations").select(ORGANIZATION_SELECT).eq("id", orgId).maybeSingle();
      if (error || !data) return false;
      const snapshot = billingSnapshotFromRow(data);
      return checkFeature(snapshot ? resolveEffectivePlan(snapshot, new Date()) : null, "incident_response").allowed;
    },

    async claim(incidentId) {
      const { data, error } = await admin.rpc("app_claim_incident_escalation", { p_incident: incidentId });
      if (error) throw new Error(`Couldn't claim the incident: ${error.message}`);
      return data === true;
    },

    async managers(orgId) {
      const { data, error } = await admin.from("organization_members").select("user_id").eq("org_id", orgId).in("role", ["owner", "admin"]);
      if (error) throw new Error(`Couldn't read the workspace's owners: ${error.message}`);
      return z.array(z.object({ user_id: z.string() })).parse(data ?? []).map((r) => r.user_id);
    },

    async tell(userId, incident) {
      const subject = `${SEVERITY_WORDS[incident.severity]} incident #${incident.number}: ${incident.title}`;
      const lines = [`An incident in your workspace is ${incident.severity === "critical" ? "critical" : "high severity"} and still open: ${incident.title}.`, "Its page has the timeline, what to contain and what would have prevented it."];
      const path = `/app/incidents/${incident.number}`;
      if (email) {
        const to = await confirmedEmail(admin, userId);
        if (to && isPlainAddress(to)) {
          await sendEmail(email, renderEmail(email, to, { subject, lines }, { label: "Open the incident", path }, "You're getting this because you're an owner or admin of this workspace on Farbaek."));
        }
      }
      if (push) await pushToPerson(push, userId, { title: subject, body: lines[0]!.slice(0, 160), url: path, tag: `incident:${incident.id}` }).catch(() => 0);
      log("info", "incident.escalated", { incident: incident.id });
    },
  };
}
