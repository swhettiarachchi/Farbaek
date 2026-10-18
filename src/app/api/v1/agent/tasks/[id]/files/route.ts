import { agentTaskFiles } from "@/server/agent/service";
import { fromAgentResult, withAgent } from "@/server/agent/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/agent/tasks/{id}/files?after=path: one page of the project's files with content. Follow `next` until it's null. */
export function GET(request: Request, { params }: Params) {
  return withAgent(request, async ({ store, agent }) => {
    const after = new URL(request.url).searchParams.get("after");
    return fromAgentResult(await agentTaskFiles(store, agent, (await params).id, after && after.length <= 300 ? after : null));
  });
}
