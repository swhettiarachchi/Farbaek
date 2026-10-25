/**
 * Escalation (ADR 0083), part of the hourly jobs: a high or critical
 * incident that's still open is told to every owner and admin of its
 * workspace, once, when the workspace has incident response tools. Each
 * incident is claimed before anyone is told, so a second run sends nothing.
 */

export interface DueIncident {
  id: string;
  orgId: string;
  number: number;
  title: string;
  severity: "high" | "critical";
}

export interface EscalationDeps {
  due(): Promise<DueIncident[]>;
  /** Whether the workspace's plan includes incident response tools. */
  hasTools(orgId: string): Promise<boolean>;
  claim(incidentId: string): Promise<boolean>;
  managers(orgId: string): Promise<string[]>;
  tell(userId: string, incident: DueIncident): Promise<void>;
}

export async function runIncidentEscalation(deps: EscalationDeps): Promise<{ escalated: number; told: number; withoutTools: number }> {
  let escalated = 0;
  let told = 0;
  let withoutTools = 0;
  const plans = new Map<string, boolean>();
  for (const incident of await deps.due()) {
    let tools = plans.get(incident.orgId);
    if (tools === undefined) {
      tools = await deps.hasTools(incident.orgId);
      plans.set(incident.orgId, tools);
    }
    if (!tools) {
      withoutTools++;
      continue;
    }
    if (!(await deps.claim(incident.id))) continue;
    escalated++;
    for (const userId of await deps.managers(incident.orgId)) {
      try {
        await deps.tell(userId, incident);
        told++;
      } catch {
        // One person's address or device failing never stops the others.
      }
    }
  }
  return { escalated, told, withoutTools };
}
