/**
 * For tests: Farbaek's relay routes in process, over the real RelayHub, so
 * RelayClient, RelayStream and MeshNode run their whole relay path with no
 * network. It answers exactly as /api/v1/agent/relay does, and keeps a copy
 * of every byte it carried so tests can check none of it is readable.
 */
import { RelayHub, type RelayAgent, type RelayErrorCode, type RelayLimits } from "@/server/mesh/relay-hub";
import { RelayClient, type Fetcher } from "./relay";

const STATUS: Record<RelayErrorCode, number> = { NOT_FOUND: 404, FORBIDDEN: 403, NOT_REACHABLE: 409, BUSY: 429, GAP: 409, TOO_LARGE: 413, CLOSED: 410 };

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const problem = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

export function fakeRelay(options: { limits?: Partial<RelayLimits>; failEvery?: number; loseAnswersEvery?: number } = {}) {
  const hub = new RelayHub({ charge: async () => true, ended: async () => undefined, limits: { waitMs: 1_000, writeWaitMs: 500, ...options.limits } });
  const agents = new Map<string, RelayAgent>();
  const carried: Buffer[] = [];
  let requests = 0;
  let dataRequests = 0;

  const fetcher: Fetcher = async (raw, init) => {
    const url = new URL(raw);
    const token = String((init.headers as Record<string, string>).Authorization ?? "").replace(/^Bearer /, "");
    const agent = agents.get(token);
    if (!agent) return problem(401, "UNAUTHENTICATED", "This agent token isn't valid.");
    // A flaky connection: some requests never arrive.
    if (options.failEvery && ++requests % options.failEvery === 0) throw new TypeError("fetch failed");
    const path = url.pathname.replace(/^\/api\/v1\/agent\/relay/, "");
    const method = init.method ?? "GET";
    // Long polls are kept short here, so tests finish quickly.
    const wait = Math.min(1_000, Math.round(Number(url.searchParams.get("wait") ?? "0") * 1000));
    const body = () => JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
    const fail = (r: { code: RelayErrorCode; message: string }) => problem(STATUS[r.code], r.code, r.message);

    if (path === "/presence" && method === "POST") {
      const b = body();
      const r = hub.setReachable(agent, b.on === true ? String(b.fingerprint) : null);
      return r.ok ? json({ data: { reachable: b.on === true } }) : fail(r);
    }
    if (path === "/presence" && method === "GET") {
      const r = await hub.waitForCalls(agent, wait);
      return r.ok ? json({ data: { calls: r.value } }) : fail(r);
    }
    if (path === "/calls" && method === "POST") {
      const b = body();
      const r = hub.call(agent, String(b.to), String(b.from));
      return r.ok ? json({ data: r.value }, 201) : fail(r);
    }
    const m = path.match(/^\/sessions\/([0-9a-f-]{36})(\/join|\/data)?$/);
    if (!m) return problem(404, "NOT_FOUND", "No such route.");
    const [, id, tail] = m;
    if (tail === "/join") {
      const r = hub.join(agent, id!);
      return r.ok ? json({ data: { joined: true } }) : fail(r);
    }
    // The server did the work, but its answer never reached the agent.
    const lost = () => {
      if (options.loseAnswersEvery && ++dataRequests % options.loseAnswersEvery === 0) throw new TypeError("fetch failed");
    };
    if (tail === "/data" && method === "POST") {
      const bytes = Buffer.from(init.body as Uint8Array);
      const r = await hub.write(agent, id!, Number(url.searchParams.get("offset")), bytes);
      if (r.ok) carried.push(bytes);
      lost();
      return r.ok ? json({ data: r.value }) : fail(r);
    }
    if (tail === "/data") {
      const r = await hub.read(agent, id!, Number(url.searchParams.get("from")), wait);
      if (!r.ok) return fail(r);
      lost();
      return new Response(new Uint8Array(r.value.bytes), {
        headers: { "x-relay-offset": String(r.value.offset), "x-relay-closed": r.value.closed ? "1" : "0", "x-relay-joined": r.value.joined ? "1" : "0" },
      });
    }
    if (method === "DELETE") {
      const r = hub.close(agent, id!, url.searchParams.get("reason") === "done" ? "done" : "cancelled");
      return r.ok ? json({ data: { closed: true } }) : fail(r);
    }
    return problem(404, "NOT_FOUND", "No such route.");
  };

  return {
    hub,
    /** Every byte agents wrote through the relay. */
    carried: () => Buffer.concat(carried),
    /** A RelayClient for an agent of a workspace, as the desktop app makes one. */
    client(agentId: string, orgId = "org-1"): RelayClient {
      const token = `token-${agentId}`;
      agents.set(token, { agentId, orgId });
      return new RelayClient("http://localhost:3000", token, fetcher);
    },
  };
}
