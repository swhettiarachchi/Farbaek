import { AGENT_DOWNLOAD } from "@/config/agent-download";
import { agentProfile } from "@/server/agent/service";
import { fromAgentResult, json, withAgent } from "@/server/agent/http";
import { sandboxExecutionMode } from "@/server/sandbox/registry";

export const dynamic = "force-dynamic";

/** GET /api/v1/agent/me: the newest version of the app too, so an app installed from the website can say when it's out of date. This agent, its workspace, its person's role, and whether a verified sandbox is connected. */
export function GET(request: Request) {
  return withAgent(request, async ({ store, agent }) => {
    const profile = await agentProfile(store, agent);
    if (!profile.ok) return fromAgentResult(profile);
    return json({ data: { ...profile.value, sandbox: sandboxExecutionMode(), latestVersion: AGENT_DOWNLOAD.version } });
  }, { bucket: "agent", perMinute: 120 }, "none");
}
