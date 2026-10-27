/**
 * The relay's route logic (ADR 0094, ADR 0096), shared by the Farbaek
 * Agent's routes (/api/v1/agent/relay, agent token) and a browser's
 * (/api/v1/mesh/relay, the person's session). Only who's asking differs;
 * every check on calls and sessions is the hub's, the same for both.
 */
import { json, problem, readJson } from "@/server/agent/http";
import { RELAY_LIMITS, type RelayAgent, type RelayHub } from "./relay-hub";
import { SessionId, offsetFrom, relayError, waitFrom } from "./relay-http";

export interface RelayContext {
  relay: RelayAgent;
  hub: RelayHub;
}

/**
 * POST presence for a browser: reachable (with its mesh fingerprint) or not.
 * Kept in the hub's memory only: a browser is reachable while its page
 * polls, and a server restart forgets it until the page says so again.
 */
export async function handleBrowserPresence(request: Request, { relay, hub }: RelayContext): Promise<Response> {
  const body = await readJson(request, 1024);
  if (!body.ok) return body.response;
  const on = body.value.on === true;
  const fingerprint = typeof body.value.fingerprint === "string" ? body.value.fingerprint : null;
  if (on && !fingerprint) return problem(400, "INVALID_REQUEST", "Send this device's mesh fingerprint to turn reachability on.");
  const r = hub.setReachable(relay, on ? fingerprint : null);
  return r.ok ? json({ data: { reachable: on } }) : relayError(r);
}

/** GET presence?wait=25: waits for calls. Polling is what keeps a device reachable. */
export async function handleWaitForCalls(request: Request, { relay, hub }: RelayContext): Promise<Response> {
  const r = await hub.waitForCalls(relay, waitFrom(new URL(request.url)));
  return r.ok ? json({ data: { calls: r.value } }) : relayError(r);
}

/** POST calls: a reachable computer of the same workspace, by its mesh fingerprint. */
export async function handleCall(request: Request, { relay, hub }: RelayContext): Promise<Response> {
  const body = await readJson(request, 1024);
  if (!body.ok) return body.response;
  const { to, from, mode = "relay" } = body.value;
  if (typeof to !== "string" || typeof from !== "string") return problem(400, "INVALID_REQUEST", "Send the fingerprints of both devices.");
  if (mode !== "relay" && mode !== "direct" && mode !== "pair") return problem(400, "INVALID_REQUEST", "A call is relay, direct or pair.");
  const r = hub.call(relay, to, from, mode);
  return r.ok ? json({ data: r.value }, 201) : relayError(r);
}

/** POST sessions/{id}/join: the called side takes the call. */
export async function handleJoin(rawId: string, { relay, hub }: RelayContext): Promise<Response> {
  const id = SessionId.safeParse(rawId);
  if (!id.success) return problem(404, "NOT_FOUND", "That call isn't waiting any more.");
  const r = hub.join(relay, id.data);
  return r.ok ? json({ data: { joined: true } }) : relayError(r);
}

/** POST sessions/{id}/data?offset=N: encrypted bytes at offset N. */
export async function handleWrite(request: Request, rawId: string, { relay, hub }: RelayContext): Promise<Response> {
  const id = SessionId.safeParse(rawId);
  if (!id.success) return problem(404, "NOT_FOUND", "That relayed connection doesn't exist.");
  const offset = offsetFrom(new URL(request.url), "offset");
  if (offset === null) return problem(400, "INVALID_REQUEST", "Say where these bytes start with ?offset=.");
  if (!(request.headers.get("content-type") ?? "").includes("application/octet-stream")) return problem(415, "UNSUPPORTED_MEDIA_TYPE", "Send the bytes as application/octet-stream.");
  if (Number(request.headers.get("content-length") ?? "0") > RELAY_LIMITS.writeBytes) return problem(413, "TOO_LARGE", "Send at most 2 MiB at a time.");
  const r = await hub.write(relay, id.data, offset, Buffer.from(await request.arrayBuffer()));
  return r.ok ? json({ data: r.value }) : relayError(r);
}

/** GET sessions/{id}/data?from=N&wait=25: the other side's bytes from N. */
export async function handleRead(request: Request, rawId: string, { relay, hub }: RelayContext): Promise<Response> {
  const id = SessionId.safeParse(rawId);
  if (!id.success) return problem(404, "NOT_FOUND", "That relayed connection doesn't exist.");
  const url = new URL(request.url);
  const from = offsetFrom(url, "from");
  if (from === null) return problem(400, "INVALID_REQUEST", "Say which bytes you need with ?from=.");
  const r = await hub.read(relay, id.data, from, waitFrom(url));
  if (!r.ok) return relayError(r);
  return new Response(new Uint8Array(r.value.bytes), {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "cache-control": "no-store",
      "x-relay-offset": String(r.value.offset),
      "x-relay-closed": r.value.closed ? "1" : "0",
      "x-relay-joined": r.value.joined ? "1" : "0",
    },
  });
}

/** DELETE sessions/{id}?reason=done|cancelled: either side ends the session. */
export async function handleClose(request: Request, rawId: string, { relay, hub }: RelayContext): Promise<Response> {
  const id = SessionId.safeParse(rawId);
  if (!id.success) return problem(404, "NOT_FOUND", "That relayed connection doesn't exist.");
  const reason = new URL(request.url).searchParams.get("reason") === "done" ? "done" : "cancelled";
  const r = hub.close(relay, id.data, reason);
  return r.ok ? json({ data: { closed: true } }) : relayError(r);
}
