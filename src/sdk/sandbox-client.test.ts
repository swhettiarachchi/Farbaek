import { describe, expect, it } from "vitest";
import { FarbaekApiError, FarbaekSandboxClient } from "./sandbox-client";

function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { f, calls };
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "x-request-id": "req-1" } });

describe("FarbaekSandboxClient", () => {
  it("sends the bearer token, workspace and an idempotency key on mutations", async () => {
    const { f, calls } = fakeFetch(() => json({ data: { id: "s1", state: "ready" } }, 201));
    const client = new FarbaekSandboxClient({ baseUrl: "https://app.test/", accessToken: "tok", workspaceId: "org1", fetch: f, newKey: () => "key-12345678" });
    const session = await client.create({ name: "Try", template: "node-ts", size: "small", network: "none", minutes: 20 });
    expect(session).toEqual({ id: "s1", state: "ready" });
    const h = new Headers(calls[0]!.init.headers);
    expect(calls[0]!.url).toBe("https://app.test/api/v1/sandboxes");
    expect(h.get("authorization")).toBe("Bearer tok");
    expect(h.get("x-farbaek-workspace")).toBe("org1");
    expect(h.get("idempotency-key")).toBe("key-12345678");
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ name: "Try", projectId: null, include: [] });
  });

  it("raises typed errors with the server's code, category and request id", async () => {
    const { f } = fakeFetch(() => json({ error: { code: "QUOTA_EXCEEDED", message: "Plan limit", category: "quota_exceeded" } }, 409));
    const client = new FarbaekSandboxClient({ baseUrl: "https://app.test", accessToken: "tok", fetch: f });
    const err = await client.get("s1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FarbaekApiError);
    expect(err).toMatchObject({ status: 409, code: "QUOTA_EXCEEDED", category: "quota_exceeded", requestId: "req-1", retryable: false });
  });

  it("encodes ids and paths", async () => {
    const { f, calls } = fakeFetch(() => json({ data: [] }));
    const client = new FarbaekSandboxClient({ baseUrl: "https://app.test", accessToken: "tok", fetch: f });
    await client.listFiles("a/b", "src/x y");
    expect(calls[0]!.url).toBe("https://app.test/api/v1/sandboxes/a%2Fb/files?path=src%2Fx%20y");
  });

  it("streams output events and ends with the recorded execution", async () => {
    const body = [
      'event: start\ndata: {"executionId":"e1"}\n\n',
      'event: stdout\ndata: {"data":"hel',
      'lo\\n"}\n\nevent: stderr\ndata: {"data":"warn\\n"}\n\n',
      'event: end\ndata: {"data":{"id":"e1","state":"succeeded","exitCode":0}}\n\n',
    ];
    const { f, calls } = fakeFetch(
      () =>
        new Response(
          new ReadableStream({
            start(c) {
              for (const part of body) c.enqueue(new TextEncoder().encode(part));
              c.close();
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    const client = new FarbaekSandboxClient({ baseUrl: "https://app.test", accessToken: "tok", fetch: f });
    const events = [];
    for await (const e of client.runStream("s1", "echo hello")) events.push(e);
    expect(events).toEqual([
      { type: "start", executionId: "e1" },
      { type: "stdout", data: "hello\n" },
      { type: "stderr", data: "warn\n" },
      { type: "end", execution: { id: "e1", state: "succeeded", exitCode: 0 } },
    ]);
    expect(new Headers(calls[0]!.init.headers).get("accept")).toBe("text/event-stream");
  });

  it("turns a streamed error into a typed error", async () => {
    const { f } = fakeFetch(() => new Response('event: error\ndata: {"error":{"code":"SESSION_BUSY","message":"busy"}}\n\n', { headers: { "content-type": "text/event-stream" } }));
    const client = new FarbaekSandboxClient({ baseUrl: "https://app.test", accessToken: "tok", fetch: f });
    const consume = async () => {
      for await (const e of client.runStream("s1", "x")) void e;
    };
    await expect(consume()).rejects.toMatchObject({ code: "SESSION_BUSY" });
  });
});
