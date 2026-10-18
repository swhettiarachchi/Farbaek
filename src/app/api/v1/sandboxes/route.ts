import { SESSION_STATES, type SessionState } from "@/core/sandbox/lifecycle";
import { fromResult, idempotencyKey, json, problem, readJson, sessionDto, withSandbox } from "@/server/sandbox/http";

export const dynamic = "force-dynamic";

/** GET /api/v1/sandboxes: sessions in the workspace, with filters, sorting and pages. */
export function GET(request: Request) {
  return withSandbox(request, async ({ actor, store }) => {
    const url = new URL(request.url);
    const states = (url.searchParams.get("state") ?? "")
      .split(",")
      .filter((s): s is SessionState => (SESSION_STATES as readonly string[]).includes(s));
    const sortParam = url.searchParams.get("sort");
    const sort = sortParam === "oldest" || sortParam === "name" || sortParam === "expiring" ? sortParam : "newest";
    const page = Math.max(1, Math.min(1000, Number(url.searchParams.get("page")) || 1));
    const pageSize = Math.max(1, Math.min(50, Number(url.searchParams.get("pageSize")) || 20));
    const { rows, total } = await store.listSessions(actor.orgId, { states, search: url.searchParams.get("q") ?? undefined, sort, page, pageSize });
    return json({ data: rows.map(sessionDto), page, pageSize, total });
  });
}

/** POST /api/v1/sandboxes: start a session. Send an Idempotency-Key header to make retries safe. */
export function POST(request: Request) {
  return withSandbox(request, async ({ actor, service, store }) => {
    const body = await readJson(request, 16 * 1024);
    if (!body.ok) return body.response;
    const result = await service.createSession(actor, { include: [], projectId: null, taskId: null, ...body.value }, idempotencyKey(request));
    if (!result.ok) return fromResult(result);
    const session = await store.getSession(result.value.sessionId);
    if (!session) return problem(500, "INTERNAL", "The session started but couldn't be read back.");
    return json({ data: sessionDto(session), created: result.value.created }, result.value.created ? 201 : 200);
  });
}
