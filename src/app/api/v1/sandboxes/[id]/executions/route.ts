import { executionDto, fromResult, idempotencyKey, json, problem, readJson, withSandbox } from "@/server/sandbox/http";

export const dynamic = "force-dynamic";
// Long builds stream for up to the plan's command limit; hosts that cap handler time need this raised.
export const maxDuration = 900;

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/sandboxes/{id}/executions: recent commands with their real outcomes. */
export function GET(request: Request, { params }: Params) {
  return withSandbox(request, async ({ actor, store }) => {
    const { id } = await params;
    const session = await store.getSession(id);
    if (!session || session.orgId !== actor.orgId) return problem(404, "NOT_FOUND", "That session doesn't exist in this workspace.");
    const limit = Math.max(1, Math.min(100, Number(new URL(request.url).searchParams.get("limit")) || 30));
    return json({ data: (await store.listExecutions(id, limit)).map(executionDto) });
  });
}

/**
 * POST /api/v1/sandboxes/{id}/executions: run a command. With
 * "Accept: text/event-stream" the output streams as server-sent events
 * (start, stdout, stderr, end); otherwise the response waits for the result.
 * The command keeps running and is recorded even if the client disconnects.
 */
export function POST(request: Request, { params }: Params) {
  return withSandbox(request, async ({ actor, service }) => {
    const { id } = await params;
    const body = await readJson(request, 16 * 1024);
    if (!body.ok) return body.response;
    const input = { command: body.value.command, timeoutSeconds: body.value.timeoutSeconds };
    const key = idempotencyKey(request);

    if (!(request.headers.get("accept") ?? "").includes("text/event-stream")) {
      return fromResult(await service.runCommand(actor, id, input, key), executionDto);
    }

    const encoder = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            closed = true;
          }
        };
        void service
          .runCommand(actor, id, input, key, {
            onStart: (executionId) => send("start", { executionId }),
            onStdout: (chunk) => send("stdout", { data: chunk }),
            onStderr: (chunk) => send("stderr", { data: chunk }),
          })
          .then((result) => {
            if (result.ok) send("end", { data: executionDto(result.value) });
            else send("error", { error: { code: result.code, message: result.message, category: result.category } });
          })
          .catch(() => send("error", { error: { code: "INTERNAL", message: "Something went wrong running the command." } }))
          .finally(() => {
            if (!closed) {
              closed = true;
              controller.close();
            }
          });
      },
      cancel() {
        closed = true;
      },
    });
    return new Response(stream, {
      headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
    });
  });
}
