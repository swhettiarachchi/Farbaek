/**
 * A minimal Model Context Protocol client (ADR 0148): JSON-RPC 2.0 over a
 * transport that carries one message per line, as MCP's stdio transport
 * does. Only what Farbaek Agent needs: initialize, list the tools, call a
 * tool. Requests the server sends back (sampling, roots, elicitation) are
 * refused, so a server can't ask the agent's model or files for anything.
 *
 * Everything a server sends is untrusted: tool names, descriptions and
 * schemas are checked and bounded before they're offered, and results go
 * back to the model as data.
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TOOLS = 64;
const MAX_DESCRIPTION = 1_024;
const MAX_SCHEMA_CHARS = 16_000;
const MAX_RESULT_CHARS = 100_000;
const MAX_LINE_CHARS = 4_000_000;

export interface LineTransport {
  send(line: string): void;
  onLine(listener: (line: string) => void): void;
  onClose(listener: (reason: string) => void): void;
  close(): void;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class McpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpError";
  }
}

export interface McpClient {
  /** What the server said about itself when it started. */
  readonly server: { name: string; version: string } | null;
  listTools(): Promise<{ tools: McpTool[]; skipped: number }>;
  callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<{ text: string; isError: boolean }>;
  close(): void;
}

type Pending = { resolve(v: unknown): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The text of a tool result: text parts as they are, anything else named, never fetched. */
export function resultText(result: unknown): { text: string; isError: boolean } {
  if (!isObject(result)) throw new McpError("The server's answer wasn't a tool result.");
  const parts = Array.isArray(result.content) ? result.content : [];
  const text = parts
    .map((p) => {
      if (!isObject(p)) return "";
      if (p.type === "text" && typeof p.text === "string") return p.text;
      if (p.type === "image") return "[an image, not shown]";
      if (p.type === "audio") return "[audio, not shown]";
      if (p.type === "resource_link" || p.type === "resource") return "[a resource, not opened]";
      return "[content Farbaek doesn't read]";
    })
    .filter(Boolean)
    .join("\n");
  const structured = !text && isObject(result.structuredContent) ? JSON.stringify(result.structuredContent) : "";
  const all = text || structured || "(no output)";
  return { text: all.length > MAX_RESULT_CHARS ? `${all.slice(0, MAX_RESULT_CHARS)}\n[farbaek: the rest of the output wasn't shown]` : all, isError: result.isError === true };
}

/** Checks one tool as the server listed it; null when it can't be offered. */
export function checkTool(raw: unknown): McpTool | null {
  if (!isObject(raw) || typeof raw.name !== "string" || raw.name.length === 0 || raw.name.length > 128) return null;
  const schema = isObject(raw.inputSchema) ? raw.inputSchema : null;
  if (!schema || schema.type !== "object") return null;
  if (JSON.stringify(schema).length > MAX_SCHEMA_CHARS) return null;
  const description = typeof raw.description === "string" ? raw.description.slice(0, MAX_DESCRIPTION) : "";
  return { name: raw.name, description, inputSchema: schema };
}

export async function connectMcp(transport: LineTransport, options: { clientVersion: string; timeoutMs?: number }): Promise<McpClient> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let closed: string | null = null;

  const failAll = (reason: string) => {
    closed = reason;
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new McpError(reason));
      pending.delete(id);
    }
  };
  transport.onClose((reason) => failAll(reason || "The MCP server stopped."));
  transport.onLine((line) => {
    if (line.length > MAX_LINE_CHARS) return;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // Servers may log to stdout by mistake; anything that isn't JSON-RPC is ignored.
    }
    if (!isObject(msg) || msg.jsonrpc !== "2.0") return;
    if (typeof msg.method === "string") {
      // A request from the server: refused. A notification: ignored.
      if (msg.id !== undefined && msg.id !== null) transport.send(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Farbaek Agent doesn't offer this." } }));
      return;
    }
    if (typeof msg.id !== "number") return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (isObject(msg.error)) p.reject(new McpError(`The MCP server refused: ${String(msg.error.message ?? "no reason given").slice(0, 300)}`));
    else p.resolve(msg.result);
  });

  const request = (method: string, params: Record<string, unknown>, signal?: AbortSignal) =>
    new Promise<unknown>((resolve, reject) => {
      if (closed) return reject(new McpError(closed));
      if (signal?.aborted) return reject(new McpError("Cancelled."));
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new McpError(`The MCP server didn't answer within ${Math.round(timeoutMs / 1000)} seconds.`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      signal?.addEventListener(
        "abort",
        () => {
          if (!pending.has(id)) return;
          pending.delete(id);
          clearTimeout(timer);
          transport.send(JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: id, reason: "Cancelled by the person." } }));
          reject(new McpError("Cancelled."));
        },
        { once: true },
      );
      transport.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });

  const init = await request("initialize", { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "Farbaek Agent", version: options.clientVersion } }).catch((e: Error) => {
    transport.close();
    throw e instanceof McpError ? e : new McpError("The MCP server didn't start.");
  });
  if (!isObject(init) || typeof init.protocolVersion !== "string") {
    transport.close();
    throw new McpError("The MCP server's first answer wasn't an MCP handshake.");
  }
  transport.send(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
  const info = isObject(init.serverInfo) ? init.serverInfo : null;
  const server = info ? { name: String(info.name ?? "").slice(0, 80), version: String(info.version ?? "").slice(0, 40) } : null;

  return {
    server,
    async listTools() {
      const tools: McpTool[] = [];
      let skipped = 0;
      let cursor: string | undefined;
      for (let page = 0; page < 5; page++) {
        const r = await request("tools/list", cursor ? { cursor } : {});
        if (!isObject(r) || !Array.isArray(r.tools)) throw new McpError("The MCP server's tool list wasn't in the expected shape.");
        for (const raw of r.tools) {
          const tool = checkTool(raw);
          if (tool && tools.length < MAX_TOOLS && !tools.some((t) => t.name === tool.name)) tools.push(tool);
          else skipped += 1;
        }
        cursor = typeof r.nextCursor === "string" && r.nextCursor ? r.nextCursor : undefined;
        if (!cursor) break;
      }
      return { tools, skipped };
    },
    async callTool(name, args, signal) {
      return resultText(await request("tools/call", { name, arguments: args }, signal));
    },
    close() {
      failAll("Closed.");
      transport.close();
    },
  };
}
